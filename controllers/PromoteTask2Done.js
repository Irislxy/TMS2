const pool = require("../config/db_connection")
const bcrypt = require("bcryptjs")
const { sendEmail } = require("../config/mailer")

exports.PromoteTask2Done = async (req, res, next) => {
  //Check for correct URL
  if (req.originalUrl !== "/api/task/promoteTask2Done") {
    return res.status(400).json({
      code: "U001"
    })
  }

  const { username, password, task_id } = req.body
  const user_name = username

  // Check if username, password, task_app_acronym, task_state is missing
  if (!username || !password || !task_id) {
    return res.status(400).json({
      code: "P001"
    })
  }

  if (password.length > 10) {
    return res.status(400).json({
      code: "A001"
    })
  }

  try {
    const query = "SELECT * FROM user WHERE user_name = ?"
    const [results] = await pool.execute(query, [username])
    // Check if user exists
    if (results.length === 0) {
      return res.status(401).json({
        code: "A001"
      })
    }

    const user = results[0] // Take the first result

    // Check if user is active
    if (user.active == 0) {
      return res.status(401).json({
        code: "A002"
      })
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password) // Compare hashed password with user input
    if (!isMatch) {
      return res.status(401).json({
        code: "A001"
      })
    }
  } catch (err) {
    console.error("Database query error:", err)
    return res.status(500).json({
      code: "E001"
    })
  }

  const [taskIdRow] = await pool.execute("SELECT task_id from task WHERE task_id = ?", [task_id])
  if (taskIdRow.length === 0) {
    return res.status(404).json({
      code: "T001"
    })
  }

  try {
    // Call enforcePermissions to check if the user has permission
    let hasPermission = await enforcePermissions(task_id, username)

    if (!hasPermission) {
      return res.status(403).json({
        code: "A003"
      })
    }
  } catch (permissionError) {
    console.error("Permission check error:", permissionError)
    return res.status(500).json({
      code: "E001"
    })
  }

  try {
    // Start a transaction
    await pool.query("START TRANSACTION")

    const [rows] = await pool.execute("SELECT task_state, task_owner, task_app_acronym FROM task WHERE task_id = ?", [task_id])

    if (rows.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }

    const taskState = rows[0]?.task_state
    const taskOwner = rows[0]?.task_owner
    const taskAppAcronym = rows[0]?.task_app_acronym

    // task_state must be "doing"
    if (taskState !== "doing") {
      return res.status(400).json({
        code: "T003" // Invalid task state
      })
    }

    const [updateRows] = await pool.execute("UPDATE task SET task_state = ?, task_owner = ? WHERE task_id = ?", ["done", username, task_id])

    if (updateRows.affectedRows === 0) {
      return res.status(400).json({
        code: "T004"
      })
    }

    // get all pl_1 to email
    const [appRow] = await pool.execute(
      `
      SELECT app_permit_done 
      FROM application 
      WHERE app_acronym = ?`,
      [taskAppAcronym]
    )

    if (appRow.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }

    const permittedGroup = appRow[0]?.app_permit_done

    // Fetch all pl email
    const [userRows] = await pool.execute(
      `
      SELECT u.email 
      FROM user u
      JOIN user_group ug ON u.user_name = ug.user_name
      JOIN group_list gl ON ug.group_id = gl.group_id
      WHERE gl.group_name = ?`,
      [permittedGroup]
    )

    if (userRows.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }

    // Extract all emails into a single array
    const emailList = userRows.map((user) => user.email)

    // Avoid sending emails if the list is empty
    if (emailList.length > 0) {
      const subject = `Task ${task_id} Promoted to Done`
      const message = `The task with ID ${task_id} has been promoted to Done by ${taskOwner}.`

      // Send one email to all recipients
      try {
        sendEmail(emailList.join(","), subject, message)
      } catch (emailError) {
        console.error(`Error sending email to ${emailList.join(",")}:`, emailError)
      }
    }

    // Commit the transaction
    await pool.query("COMMIT")

    return res.status(200).json({
      code: "S001"
    })
  } catch (error) {
    // Rollback transaction in case of error
    await pool.query("ROLLBACK")
    console.error("Error while promoting task:", error)
    return res.status(500).json({
      code: "E001"
    })
  }
}

async function enforcePermissions(task_id, username) {
  // Fetch task details and allowed group for current state
  const [taskRow] = await pool.execute(
    `
    SELECT task_state, app_permit_open, app_permit_todo, app_permit_doing, app_permit_done 
    FROM task 
    JOIN application ON task.task_app_acronym = application.app_acronym 
    WHERE task_id = ?`,
    [task_id]
  )

  if (taskRow.length === 0) {
    return res.status(404).json({
      code: "T001"
    })
  }

  const taskState = taskRow[0].task_state
  const permittedGroup = taskRow[0][`app_permit_${taskState}`] // dynamically get group for current state
  console.log(permittedGroup)
  // Check if user belongs to the allowed group (group_name)
  const [userGroupRow] = await pool.execute(
    `
    SELECT group_list.group_name 
    FROM user_group 
    JOIN group_list ON user_group.group_id = group_list.group_id 
    WHERE user_group.user_name = ?`,
    [username]
  )

  if (userGroupRow.length === 0) {
    return res.status(404).json({
      code: "T001"
    })
  }

  const userGroup = userGroupRow[0]?.group_name

  return userGroup === permittedGroup // Return true if user is in the permitted group
}
