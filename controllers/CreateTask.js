const pool = require("../config/db_connection")
const bcrypt = require("bcryptjs")

exports.CreateTask = async (req, res, next) => {
  //Check for correct URL
  if (req.originalUrl !== "/api/task/createTask") {
    return res.status(400).json({
      code: "U001"
    })
  }

  const { username, password, task_name, task_description, task_notes, task_plan, task_appAcronym } = req.body
  const user_name = username
  const task_app_acronym = task_appAcronym

  // Check if username, password, task_name, task_app_acronym is missing
  if (!username || !password || !task_name || !task_appAcronym) {
    return res.status(400).json({
      code: "P001"
    })
  }

  if (password.length > 10) {
    return res.status(400).json({
      code: "A001"
    })
  }

  if (task_name.length > 64) {
    return res.status(400).json({
      code: "T002"
    })
  }

  if (task_description && task_description.length > 255) {
    return res.status(400).json({
      code: "T002"
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

  //check task permission
  try {
    // 1. Fetch the permitted group for creating tasks from the `application` table
    const [appRow] = await pool.execute("SELECT app_permit_create FROM application WHERE app_acronym = ?", [task_appAcronym])

    if (appRow.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }

    const allowedCreateGroup = appRow[0].app_permit_create // Get allowed group (e.g., 'pl_1')

    // 2. Check if the user belongs to the permitted group from the `user_group` table
    const [userGroupRow] = await pool.execute(
      `
      SELECT ug.group_id 
      FROM user_group ug
      JOIN group_list gl ON ug.group_id = gl.group_id
      WHERE ug.user_name = ? AND gl.group_name = ?
    `,
      [username, allowedCreateGroup]
    )

    // If user is not in the allowed group, return a permission error
    if (userGroupRow.length === 0) {
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

  // Default values
  let task_state = "open"
  let task_creator = username
  let task_owner = username
  let task_createdate = new Date().toISOString().split("T")[0] // Only the date part

  // Add the audit trail entry for task notes
  let formattedNotes = ""
  if (task_notes) {
    formattedNotes = `\n[${new Date().toLocaleString("en-US")}] (${username} - ${task_state}): ${task_notes}`
  }

  if (task_plan) {
    const [planRow] = await pool.execute("SELECT plan_mvp_name from plan WHERE plan_mvp_name = ? AND plan_app_acronym = ?", [task_plan, task_appAcronym])
    if (planRow.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }
  }

  try {
    // Start a transaction
    await pool.query("START TRANSACTION")

    // 1. Fetch the current running number from the application table
    const [rows] = await pool.execute("SELECT app_rnumber FROM application WHERE app_acronym = ?", [task_appAcronym])

    if (rows.length === 0) {
      return res.status(404).json({
        code: "T001"
      })
    }

    let current_running_number = rows[0].app_rnumber

    // 2. Increment the running number
    current_running_number += 1

    // 3. Update the application table with the new running number
    await pool.execute("UPDATE application SET app_rnumber = ? WHERE app_acronym = ?", [current_running_number, task_appAcronym])

    // 4. Generate the task_id in the format '[app_acronym]_[running number]'
    const task_id = `${task_appAcronym}_${current_running_number}`

    // 5. Insert the new task into the task table
    const insertQuery = `
      INSERT INTO task (
        task_id, task_name, task_description, task_notes, task_plan, 
        task_app_acronym, task_state, task_creator, task_owner, task_createdate
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    await pool.execute(insertQuery, [task_id, task_name, task_description || null, formattedNotes || null, task_plan || null, task_appAcronym, task_state, task_creator, task_owner, task_createdate])

    // 6. Commit the transaction
    await pool.query("COMMIT")

    // Return success response
    return res.status(200).json({
      task_id: task_id,
      code: "S001"
    })
  } catch (error) {
    // Rollback transaction in case of error
    await pool.query("ROLLBACK")
    console.error("Error while creating task:", error)

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        code: "T004"
      })
    }

    return res.status(500).json({
      code: "E001"
    })
  }
}
