importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyA7T1b8jHZOCy_m_ZlbA9kykw1CJEMW_GM",
    authDomain: "smart-cold-storage-kelompok11.firebaseapp.com",
    databaseURL: "https://smart-cold-storage-kelompok11-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "smart-cold-storage-kelompok11",
    storageBucket: "smart-cold-storage-kelompok11.firebasestorage.app",
    messagingSenderId: "325259787528",
    appId: "1:325259787528:web:0034ffc3452b1f666ac0bd"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/vite.svg"
  });
});