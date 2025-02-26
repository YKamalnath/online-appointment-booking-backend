require("dotenv").config();

const express = require("express");
const {admin, db} = require("./firebase");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const nodemailer = require("nodemailer");


dotenv.config();

app.use(cors());
app.use(express.json()); // for parsing application/json


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: '', // you email address
    pass: ''  // Replace with app-specific password if 2FA is enabled
  }
});



// Route to handle contact message submission
app.post("/api/contact-doctor", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).send({ message: "All fields are required" });
  }

  // Send email notification to the doctor
  const mailOptions = {
    from: email,
    to: 'johnkamal2000@gmail.com', // Replace with the doctor's email
    subject: `New Message from ${name}`,
    text: `You have received a new message from ${name} (${email}):\n\n${message}`,
  };

  // const mailOptions = {
  //   from: 'officialwep009@gmail.com',
  //   to: 'johnkamal2000@gmail.com',
  //   subject: 'Test Email',
  //   text: 'Hello world!'
  // };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send({ message: "Message sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({ message: "Error sending message" });
  }
});


// Verify Firebase ID Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    // req.user = decodedToken;
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    req.user = {
        ...decodedToken,
        role: userRecord.customClaims?.role || "patient",
      };
    next();
  } catch (error) {
    res.status(401).send({ message: "Unauthorized: Invalid token" });
  }
};

// Route to handle user registration (Signup)
app.post("/signup", async (req, res) => {
  const { email, password, name, userRole } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Set user role as a custom claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: userRole });

     // Save user details in Firestore
    //  await db.collection("users").doc(userRecord.uid).set({
    //   name,
    //   email,
    //   role: userRole,
    //   createdAt: admin.firestore.FieldValue.serverTimestamp(),
    // });

    res.status(201).send({ message: "User created successfully", uid: userRecord.uid });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Login Endpoint (Verify ID Token and Return User Data)
app.post("/login", verifyToken, async (req, res) => {
  const { uid } = req.user;

  try {
    const user = await admin.auth().getUser(uid);
    const userRole = req.user.role || "patient"; // Assume 'patient' if no role set

    res.status(200).send({
      message: "User authenticated",
      user: {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        role: userRole,
      },
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to retrieve user data" });
  }
});

//Login User name 
app.post("/get-email", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });

  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("name", "==", name).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = snapshot.docs[0].data();
    return res.json({ email: user.email });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});



// Route to fetch all users (Only accessible by doctors)
app.get("/users", verifyToken, async (req, res) => {
  try {
    // Ensure only doctors can fetch users
    if (req.user.role !== "doctor") {
      return res.status(403).send({ message: "Forbidden: Access denied" });
    }

    let usersList = [];
    let nextPageToken;

    do {
      const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
      usersList = usersList.concat(
        listUsersResult.users.map((user) => ({
          uid: user.uid,
          name: user.displayName || "No Name",
          email: user.email,
          role: user.customClaims?.role || "patient",
        }))
      );
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    res.status(200).send(usersList);
  } catch (error) {
    res.status(500).send({ message: "Error fetching users", error: error.message });
  }
});

// Route to delete a user (Only accessible by doctors)
app.delete("/users/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;

  try {
    // Ensure only doctors can delete users
    if (req.user.role !== "doctor") {
      return res.status(403).send({ message: "Forbidden: Access denied" });
    }

    await admin.auth().deleteUser(uid);
    res.status(200).send({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).send({ message: "Error deleting user", error: error.message });
  }
});



// Route to save an appointment
app.post("/appointments", verifyToken, async (req, res) => {
  const { name, date, time, contact } = req.body;

  if (!name || !date || !time || !contact) {
    return res.status(400).send({ message: "All fields are required" });
  }

  try {

    // Check if the time slot is already taken
    const snapshot = await db.collection("appointments")
      .where("date", "==", date)
      .where("time", "==", time)
      .get();

    if (!snapshot.empty) {
      return res.status(400).send({ message: "This time slot is already booked." });
    }
    
    // Save the appointment if the time slot is available
    const appointmentRef = await db.collection("appointments").add({
      name,
      date,
      time,
      contact,
      userId: req.user.uid,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).send({ message: "Appointment booked successfully", id: appointmentRef.id });
  } catch (error) {
    res.status(500).send({ message: "Error saving appointment", error: error.message });
  }
});

// Route to get user-specific appointments
app.get("/appointments", verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection("appointments").where("userId", "==", req.user.uid).get();
    if (snapshot.empty) {
      return res.status(200).send([]);
    }

    const appointments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).send(appointments);
  } catch (error) {
    res.status(500).send({ message: "Error fetching appointments", error: error.message });
  }
});

//save user information in db
app.post("/api/user-info", verifyToken, async (req, res) => {
  const { name, dob, email, address, description } = req.body;

  if (!name || !dob || !email || !address || !description) {
    return res.status(400).send({ message: "All fields are required" });
  }

  try {
    const userRef = db.collection("users").doc(req.user.uid);
    await userRef.set({
      name,
      dob,
      email,
      address,
      description,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).send({ message: "User information saved successfully" });
  } catch (error) {
    res.status(500).send({ message: "Error saving user information", error: error.message });
  }
});

app.get("/api/user-info", verifyToken, async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "User information not found" });
    }

    res.status(200).send(doc.data());
  } catch (error) {
    res.status(500).send({ message: "Error fetching user information", error: error.message });
  }
});


app.get("/api/user-info/:uid", verifyToken, async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "User information not found" });
    }

    res.status(200).send(doc.data());
  } catch (error) {
    res.status(500).send({ message: "Error fetching user information", error: error.message });
  }
});
//patient appointment view
app.get("/user-appointments", verifyToken, async (req, res) => {
  try {
    const userAppointmentsRef = db.collection("appointments").where("userId", "==", req.user.uid);
    const snapshot = await userAppointmentsRef.get();

    if (snapshot.empty) {
      return res.status(200).json([]); // Return empty list instead of "not found"
    }

    const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching appointments", error: error.message });
  }
});





const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


