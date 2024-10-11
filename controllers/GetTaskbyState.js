const pool = require("../config/db_connection")
const bcrypt = require("bcryptjs")

const states = ["open", "todo", "doing", "done", "close"]

exports.GetTaskbyState = async (req, res, next) => {
  //Check for correct URL
  if (req.originalUrl !== "/api/task/getTaskByState") {
    return res.status(400).json({
      code: "U001"
    })
  }

  const { username, password, task_appAcronym, task_state } = req.body
  const user_name = username
  const task_app_acronym = task_appAcronym

  // Check if username, password, task_app_acronym, task_state is missing
  if (!username || !password || !task_appAcronym || !task_state) {
    return res.status(400).json({
      code: "P001"
    })
  }

  if (password.length > 10) {
    return res.status(400).json({
      code: "A001"
    })
  }

  if (!states.includes(task_state)) {
    return res.status(400).json({
      code: "T001"
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

  try {
    const taskQuery = `
    SELECT task.task_id, task.task_name, task.task_description, task.task_owner, plan.plan_colour 
    FROM task
    LEFT JOIN plan 
    ON task.task_plan = plan.plan_mvp_name AND
    task.task_app_acronym = plan.plan_app_acronym
    WHERE task.task_app_acronym = ? AND task.task_state = ?
    `

    const [results] = await pool.execute(taskQuery, [task_appAcronym, task_state])

    return res.status(200).json({
      data: results,
      code: "S001"
    })
  } catch (error) {
    console.error("Error while getting task:", error)
    return res.status(500).json({
      code: "E001"
    })
  }
}
