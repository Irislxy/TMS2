const express = require("express")
const app = express()
const pool = require("./config/db_connection")
const dotenv = require("dotenv")
const { GetTaskbyState } = require("./controllers/GetTaskbyState")
const { CreateTask } = require("./controllers/CreateTask")
const { PromoteTask2Done } = require("./controllers/PromoteTask2Done")

// Setting up config.env file variables
dotenv.config({ path: "./.env" })

app.use(express.json())

app.post("/api/task/getTaskByState", GetTaskbyState)
app.post("/api/task/createTask", CreateTask)
app.patch("/api/task/promoteTask2Done", PromoteTask2Done)

app.use((req, res) => {
  res.status(400).json({ code: "U001" })
})

async function initializeApp() {
  try {
    // Get a connection from the pool
    const connection = await pool.getConnection()

    console.log("Successfully connected to the MySQL database")

    // Start the microservice on port 3000
    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => {
      console.log(`Microservice running on port ${PORT}`)
    })

    // Release the connection back to the pool
    connection.release()
  } catch (err) {
    console.error("Failed to connect to the database:", err.message)
    process.exit(1) // Exit if DB connection fails
  }
}

initializeApp()
