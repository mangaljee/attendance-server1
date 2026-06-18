const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Naye Neon Database ka connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// 1. EMPLOYEE MANAGEMENT
// ==========================================

// Naya employee add karna (Admin Only)
app.post('/api/employees/add', async (req, res) => {
    const { emp_code, name, phone, pin } = req.body;
    try {
        await pool.query(
            'INSERT INTO employees (emp_code, name, phone, pin) VALUES ($1, $2, $3, $4)',
            [emp_code, name, phone, pin]
        );
        res.json({ success: true, message: "Employee registered successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Emp Code pehle se exist karta hai ya invalid data." });
    }
});

// Sabhi employees ki list dekhna
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT emp_code, name, phone FROM employees ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. SMART ATTENDANCE (GEOFENCED)
// ==========================================

// QR Scan ke baad Check-In ya Check-Out mark karna
app.post('/api/attendance/punch', async (req, res) => {
    const { emp_code, lat, lon } = req.body;
    
    try {
        // Check karein ki kya is employee ne aaj pehle hi check-in kiya hai?
        const checkExisting = await pool.query(
            'SELECT * FROM attendance WHERE emp_code = $1 AND attendance_date = CURRENT_DATE',
            [emp_code]
        );

        if (checkExisting.rows.length === 0) {
            // NAYA CHECK-IN (Subah)
            await pool.query(
                'INSERT INTO attendance (emp_code, punch_location_lat, punch_location_lon) VALUES ($1, $2, $3)',
                [emp_code, lat, lon]
            );
            res.json({ success: true, action: "CHECK_IN", message: "Morning Check-In Successful!" });
        } else {
            // CHECK-OUT (Shaam ko ghar jate waqt)
            // Agar check_out_time pehle se null hai, toh hi update karein
            if (checkExisting.rows[0].check_out_time === null) {
                await pool.query(
                    'UPDATE attendance SET check_out_time = CURRENT_TIMESTAMP WHERE emp_code = $1 AND attendance_date = CURRENT_DATE',
                    [emp_code]
                );
                res.json({ success: true, action: "CHECK_OUT", message: "Evening Check-Out Successful!" });
            } else {
                res.json({ success: false, message: "Aapki aaj ki chhutti pehle hi mark ho chuki hai." });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin ke liye aaj ki attendance report
app.get('/api/attendance/today', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.name, e.emp_code, a.check_in_time, a.check_out_time, a.status 
            FROM attendance a
            JOIN employees e ON a.emp_code = e.emp_code
            WHERE a.attendance_date = CURRENT_DATE
            ORDER BY a.check_in_time DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
app.listen(port, () => {
    console.log(`Smart Attendance Server running on port ${port}`);
});
