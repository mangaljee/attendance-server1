const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// 1. AUTHENTICATION (ADMIN & EMPLOYEE)
// ==========================================
app.post('/api/admin/login', async (req, res) => {
    const { pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM admin_auth WHERE pin = $1', [pin]);
        if (result.rows.length > 0) res.json({ success: true, message: "Login Successful" });
        else res.json({ success: false, message: "Invalid PIN" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees/login', async (req, res) => {
    const { emp_code, pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employees WHERE emp_code = $1 AND pin = $2', [emp_code, pin]);
        if (result.rows.length > 0) res.json({ success: true, data: result.rows[0] });
        else res.json({ success: false, message: "Invalid Employee Code or PIN" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees/add', async (req, res) => {
    const { emp_code, name, phone, pin } = req.body;
    try {
        await pool.query('INSERT INTO employees (emp_code, name, phone, pin) VALUES ($1, $2, $3, $4)', [emp_code, name, phone, pin]);
        res.json({ success: true, message: "Employee registered!" });
    } catch (err) { res.status(500).json({ error: "Employee Code exists." }); }
});

// ==========================================
// 2. SMART PUNCH SYSTEM (SERVER TIME + REWARDS)
// ==========================================
app.post('/api/attendance/punch', async (req, res) => {
    const { emp_code, lat, lon, punch_type, photo } = req.body; 
    
    try {
        // 🔥 SERVER TIME (No Phone Time Hack)
        const serverTime = new Date();
        const currentHour = serverTime.getHours() + 5; // IST adjustment (Approximate, configure properly if needed)
        const currentMin = serverTime.getMinutes() + 30;

        const checkExisting = await pool.query('SELECT * FROM attendance WHERE emp_code = $1 AND attendance_date = CURRENT_DATE', [emp_code]);

        if (checkExisting.rows.length === 0) {
            await pool.query('INSERT INTO attendance (emp_code, punch_location_lat, punch_location_lon, photo) VALUES ($1, $2, $3, $4)', [emp_code, lat, lon, photo]);
            
            // 🔥 REWARD LOGIC: Subah 10:15 se pehle aaye toh +10 Points
            if (currentHour < 10 || (currentHour === 10 && currentMin <= 15)) {
                await pool.query('UPDATE employees SET points = points + 10, current_streak = current_streak + 1 WHERE emp_code = $1', [emp_code]);
                return res.json({ success: true, message: "Morning Check-In! 🌟 Early Bird: +10 Points!" });
            } else {
                await pool.query('UPDATE employees SET current_streak = 0 WHERE emp_code = $1', [emp_code]);
                return res.json({ success: true, message: "Morning Check-In! You were late today." });
            }
        } 

        const record = checkExisting.rows[0];
        if (punch_type === "LUNCH_OUT" && record.lunch_out_time === null) {
            await pool.query('UPDATE attendance SET lunch_out_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Lunch Break Started!" });
        }
        if (punch_type === "LUNCH_IN" && record.lunch_in_time === null && record.lunch_out_time !== null) {
            await pool.query('UPDATE attendance SET lunch_in_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Welcome Back!" });
        }
        if (punch_type === "CHECK_OUT" && record.check_out_time === null) {
            await pool.query('UPDATE attendance SET check_out_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Evening Check-Out Done!" });
        }
        res.json({ success: false, message: "Action already completed or invalid order." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. ADMIN & EMPLOYEE HISTORY REPORTS
// ==========================================
app.get('/api/attendance/history', async (req, res) => {
    const { date } = req.query; 
    try {
        const result = await pool.query(`
            SELECT e.name, e.emp_code, a.check_in_time, a.lunch_out_time, a.lunch_in_time, a.check_out_time, a.photo, a.punch_location_lat, a.punch_location_lon 
            FROM attendance a JOIN employees e ON a.emp_code = e.emp_code 
            WHERE a.attendance_date = $1 ORDER BY a.check_in_time DESC
        `, [date]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/my-history/:emp_code', async (req, res) => {
    const { emp_code } = req.params;
    try {
        const result = await pool.query(`
            SELECT attendance_date, check_in_time, lunch_out_time, lunch_in_time, check_out_time 
            FROM attendance WHERE emp_code = $1 ORDER BY attendance_date DESC LIMIT 30
        `, [emp_code]);
        res.json({ success: true, data: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Smart Attendance API running on port ${port}`));
