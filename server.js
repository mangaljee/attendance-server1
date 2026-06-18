const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// 1. SECURE ADMIN AUTHENTICATION
// ==========================================

// Admin Login Check
app.post('/api/admin/login', async (req, res) => {
    const { pin } = req.body;
    try {
        const result = await pool.query('SELECT * FROM admin_auth WHERE pin = $1', [pin]);
        if (result.rows.length > 0) {
            res.json({ success: true, message: "Login Successful" });
        } else {
            res.json({ success: false, message: "Invalid PIN" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin PIN Change Karna
app.post('/api/admin/change-pin', async (req, res) => {
    const { oldPin, newPin } = req.body;
    try {
        const check = await pool.query('SELECT * FROM admin_auth WHERE pin = $1', [oldPin]);
        if (check.rows.length > 0) {
            await pool.query('UPDATE admin_auth SET pin = $1 WHERE pin = $2', [newPin, oldPin]);
            res.json({ success: true, message: "PIN Changed Successfully!" });
        } else {
            res.json({ success: false, message: "Old PIN is incorrect." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. EMPLOYEE MANAGEMENT
// ==========================================
app.post('/api/employees/add', async (req, res) => {
    const { emp_code, name, phone, pin } = req.body;
    try {
        await pool.query('INSERT INTO employees (emp_code, name, phone, pin) VALUES ($1, $2, $3, $4)', [emp_code, name, phone, pin]);
        res.json({ success: true, message: "Employee registered!" });
    } catch (err) { res.status(500).json({ error: "Emp Code exists." }); }
});

app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT emp_code, name FROM employees ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. ADVANCED 4-STEP ATTENDANCE PUNCH
// ==========================================
app.post('/api/attendance/punch', async (req, res) => {
    const { emp_code, lat, lon, punch_type } = req.body; 
    // punch_type = "CHECK_IN", "LUNCH_OUT", "LUNCH_IN", ya "CHECK_OUT"

    try {
        const checkExisting = await pool.query('SELECT * FROM attendance WHERE emp_code = $1 AND attendance_date = CURRENT_DATE', [emp_code]);

        if (checkExisting.rows.length === 0) {
            // STEP 1: Morning Check-In
            await pool.query('INSERT INTO attendance (emp_code, punch_location_lat, punch_location_lon) VALUES ($1, $2, $3)', [emp_code, lat, lon]);
            return res.json({ success: true, message: "Morning Check-In Done!" });
        } 

        const record = checkExisting.rows[0];

        // STEP 2: Lunch Out
        if (punch_type === "LUNCH_OUT" && record.lunch_out_time === null) {
            await pool.query('UPDATE attendance SET lunch_out_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Lunch Break Started!" });
        }

        // STEP 3: Lunch In
        if (punch_type === "LUNCH_IN" && record.lunch_in_time === null && record.lunch_out_time !== null) {
            await pool.query('UPDATE attendance SET lunch_in_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Welcome Back from Lunch!" });
        }

        // STEP 4: Evening Check-Out
        if (punch_type === "CHECK_OUT" && record.check_out_time === null) {
            await pool.query('UPDATE attendance SET check_out_time = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
            return res.json({ success: true, message: "Evening Check-Out Done. Have a good day!" });
        }

        res.json({ success: false, message: "Invalid Punch. Aap already yeh action kar chuke hain." });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Dashboard Report
app.get('/api/attendance/today', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.name, a.check_in_time, a.lunch_out_time, a.lunch_in_time, a.check_out_time 
            FROM attendance a JOIN employees e ON a.emp_code = e.emp_code 
            WHERE a.attendance_date = CURRENT_DATE ORDER BY a.check_in_time DESC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Advanced Server running on port ${port}`));
