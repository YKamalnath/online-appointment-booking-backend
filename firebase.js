require('dotenv').config();

const admin = require('firebase-admin');

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: "7a1a5551b2aadffaefccb610a255fb30f7e6d4d2",
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix the newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: "111879664025260241608",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40sanji-medical.iam.gserviceaccount.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = { db, admin };
