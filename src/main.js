import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, onValue,
  query, orderByChild, limitToLast, set
} from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA7T1b8jHZOCy_m_ZlbA9kykw1CJEMW_GM",
  authDomain: "smart-cold-storage-kelompok11.firebaseapp.com",
  databaseURL: "https://smart-cold-storage-kelompok11-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "smart-cold-storage-kelompok11",
  storageBucket: "smart-cold-storage-kelompok11.firebasestorage.app",
  messagingSenderId: "325259787528",
  appId: "1:325259787528:web:0034ffc3452b1f666ac0bd"
};

const VAPID_KEY = "BG43BtiZBtaSrqs2ZECXJdgWA4pegvzF7M3KPdqVIplk1Up3yTI6rPZCTD7khInFcHzP3C_qvP2lBsfjThT2c3U";

const app       = initializeApp(firebaseConfig);
const db        = getDatabase(app);
const auth      = getAuth(app);
const messaging = getMessaging(app);

let configData = { suhu_min: null, suhu_max: null };
let chart      = null;

// =====================
// AUTH
// =====================
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("halaman-login").style.display     = "none";
    document.getElementById("halaman-dashboard").style.display = "block";
    document.getElementById("user-email").textContent          = user.email;
    initDashboard();
  } else {
    document.getElementById("halaman-login").style.display     = "flex";
    document.getElementById("halaman-dashboard").style.display = "none";
  }
});

// =====================
// LOGIN
// =====================
document.getElementById("btn-login").addEventListener("click", async () => {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl  = document.getElementById("login-error");

  if (!email || !password) {
    errorEl.textContent = "⚠️ Email dan password harus diisi!";
    return;
  }

  try {
    document.getElementById("btn-login").textContent = "Memuat...";
    await signInWithEmailAndPassword(auth, email, password);
    errorEl.textContent = "";
  } catch (err) {
    document.getElementById("btn-login").textContent = "Masuk";
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      errorEl.textContent = "❌ Email atau password salah";
    } else if (err.code === "auth/user-not-found") {
      errorEl.textContent = "❌ Akun tidak ditemukan";
    } else if (err.code === "auth/too-many-requests") {
      errorEl.textContent = "❌ Terlalu banyak percobaan, coba lagi nanti";
    } else {
      errorEl.textContent = "❌ " + err.message;
    }
  }
});

// =====================
// LOGOUT
// =====================
document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
});

// =====================
// INIT DASHBOARD
// =====================
function initDashboard() {

  // --- Sensor suhu, pintu, peltier, kipas ---
  onValue(ref(db, "sensor"), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Suhu
    document.getElementById("suhu").innerHTML =
      `${data.suhu}<span class="unit">°C</span>`;

    // Alert suhu
    if (configData.suhu_min !== null && configData.suhu_max !== null) {
      const alertEl   = document.getElementById("alert-suhu");
      const alertText = document.getElementById("alert-suhu-text");
      if (data.suhu < configData.suhu_min) {
        alertText.textContent = `Suhu terlalu rendah! ${data.suhu}°C (min: ${configData.suhu_min}°C)`;
        alertEl.classList.add("show");
        simpanNotifikasi(`⚠️ Suhu terlalu rendah: ${data.suhu}°C`);
      } else if (data.suhu > configData.suhu_max) {
        alertText.textContent = `Suhu terlalu tinggi! ${data.suhu}°C (maks: ${configData.suhu_max}°C)`;
        alertEl.classList.add("show");
        simpanNotifikasi(`⚠️ Suhu terlalu tinggi: ${data.suhu}°C`);
      } else {
        alertEl.classList.remove("show");
      }
    }

    // Status pintu
    const pintuEl = document.getElementById("pintu");
    const isBuka  = data.pintu === "terbuka";
    pintuEl.textContent = isBuka ? "🔓 Terbuka" : "🔒 Tertutup";
    pintuEl.className   = `status-badge ${isBuka ? "buka" : "tutup"}`;
    if (isBuka) simpanNotifikasi("🚪 Pintu sedang terbuka");

    // Status peltier
    const peltierNyala  = data.peltier === "nyala";
    const iconPeltier   = document.getElementById("icon-peltier");
    const statusPeltier = document.getElementById("status-peltier");
    iconPeltier.className     = `device-icon ${peltierNyala ? "nyala" : "mati"}`;
    statusPeltier.textContent = peltierNyala ? "Nyala" : "Mati";
    statusPeltier.className   = `device-status ${peltierNyala ? "nyala" : "mati"}`;

    // Status kipas
    const kipasNyala  = data.kipas === "nyala";
    const iconKipas   = document.getElementById("icon-kipas");
    const statusKipas = document.getElementById("status-kipas");
    iconKipas.className     = `device-icon ${kipasNyala ? "nyala" : "mati"}`;
    statusKipas.textContent = kipasNyala ? "Nyala" : "Mati";
    statusKipas.className   = `device-status ${kipasNyala ? "nyala" : "mati"}`;

    // Timestamp
    if (data.timestamp) {
      document.getElementById("timestamp").textContent =
        "Update terakhir: " + new Date(data.timestamp).toLocaleString("id-ID");
    }
  });

  // --- UID RFID terakhir ---
  onValue(ref(db, "rfid/terakhir"), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    document.getElementById("uid-terakhir").textContent = data.uid || "--";
    if (data.waktu) {
      document.getElementById("uid-waktu").textContent =
        new Date(data.waktu).toLocaleString("id-ID");
    }
  });

  // --- Log akses RFID ---
  onValue(query(ref(db, "logs"), orderByChild("waktu"), limitToLast(10)), (snapshot) => {
    const tbody = document.getElementById("log-body");
    if (!snapshot.exists()) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#bbb;padding:24px">Belum ada data</td></tr>`;
      return;
    }
    const logs = [];
    snapshot.forEach(child => logs.push(child.val()));
    logs.reverse();
    tbody.innerHTML = logs.map(log => {
      const waktu       = log.waktu ? new Date(log.waktu).toLocaleString("id-ID") : "-";
      const statusClass = log.status === "masuk" ? "masuk" : "ditolak";
      const statusLabel = log.status === "masuk" ? "✅ Masuk" : "❌ Ditolak";
      if (log.status === "ditolak") simpanNotifikasi(`🚫 Kartu tidak dikenal: ${log.uid}`);
      return `
        <tr>
          <td>${waktu}</td>
          <td><span style="font-family:monospace;letter-spacing:1px">${log.uid || "-"}</span></td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        </tr>`;
    }).join("");
  });

  // --- Histori suhu (grafik + tabel) ---
  onValue(query(ref(db, "histori_suhu"), orderByChild("waktu"), limitToLast(20)), (snapshot) => {
    if (!snapshot.exists()) {
      document.getElementById("chart-empty").style.display  = "block";
      document.getElementById("chart-suhu").style.display   = "none";
      document.getElementById("histori-body").innerHTML =
        `<tr><td colspan="2" style="text-align:center;color:#bbb;padding:24px">Histori suhu kosong</td></tr>`;
      return;
    }

    // Siapkan data
    const labels = [], dataGrafik = [], dataHistori = [];
    snapshot.forEach(child => {
      const d = child.val();
      labels.push(new Date(d.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
      dataGrafik.push(d.suhu);
      dataHistori.push(d);
    });

    // Grafik
    document.getElementById("chart-empty").style.display = "none";
    document.getElementById("chart-suhu").style.display  = "block";
    const ctx = document.getElementById("chart-suhu").getContext("2d");
    if (chart) {
      chart.data.labels            = labels;
      chart.data.datasets[0].data  = dataGrafik;
      chart.update();
    } else {
      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Suhu (°C)",
            data: dataGrafik,
            borderColor: "#1a73e8",
            backgroundColor: "rgba(26,115,232,0.07)",
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: "#1a73e8",
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              title: { display: true, text: "°C" },
              grid: { color: "rgba(0,0,0,0.04)" }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // Tabel histori
    const historiBody = document.getElementById("histori-body");
    historiBody.innerHTML = [...dataHistori].reverse().map(d => `
      <tr>
        <td>${new Date(d.waktu).toLocaleString("id-ID")}</td>
        <td style="font-weight:600;color:#1a73e8">${d.suhu}°C</td>
      </tr>
    `).join("");
  });

  // --- Config threshold ---
  onValue(ref(db, "config"), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    configData = { suhu_min: data.suhu_min, suhu_max: data.suhu_max };
    document.getElementById("suhu-min").value        = data.suhu_min       ?? "";
    document.getElementById("suhu-max").value        = data.suhu_max       ?? "";
    document.getElementById("durasi-peltier").value  = data.durasi_peltier ?? "";
    document.getElementById("durasi-kipas").value    = data.durasi_kipas   ?? "";
    document.getElementById("chip-suhu-min").textContent = `Suhu min: ${data.suhu_min ?? "--"}°C`;
    document.getElementById("chip-suhu-max").textContent = `Suhu maks: ${data.suhu_max ?? "--"}°C`;
    document.getElementById("chip-peltier").textContent  = `Peltier: ${data.durasi_peltier ?? "--"} menit`;
    document.getElementById("chip-kipas").textContent    = `Kipas: ${data.durasi_kipas ?? "--"} menit`;
  });

  // --- Simpan config ---
  document.getElementById("btn-simpan").addEventListener("click", async () => {
    const suhuMin       = parseFloat(document.getElementById("suhu-min").value);
    const suhuMax       = parseFloat(document.getElementById("suhu-max").value);
    const durasiPeltier = parseFloat(document.getElementById("durasi-peltier").value);
    const durasiKipas   = parseFloat(document.getElementById("durasi-kipas").value);

    if ([suhuMin, suhuMax, durasiPeltier, durasiKipas].some(isNaN)) {
      showStatus("simpan-status", "⚠️ Semua kolom harus diisi!", "#d93025"); return;
    }
    if (suhuMin >= suhuMax) {
      showStatus("simpan-status", "⚠️ Suhu minimum harus lebih kecil dari maksimum!", "#d93025"); return;
    }
    try {
      await set(ref(db, "config"), {
        suhu_min: suhuMin, suhu_max: suhuMax,
        durasi_peltier: durasiPeltier, durasi_kipas: durasiKipas
      });
      showStatus("simpan-status", "✅ Pengaturan berhasil disimpan!", "#137333");
    } catch (err) {
      showStatus("simpan-status", "❌ Gagal: " + err.message, "#d93025");
    }
  });

  // --- FCM ---
  document.getElementById("btn-notif").addEventListener("click", async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showStatus("notif-status", "❌ Izin notifikasi ditolak", "#d93025"); return;
      }
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js")
      });
      if (token) {
        await set(ref(db, "fcm_token"), token);
        showStatus("notif-status", "✅ Notifikasi berhasil diaktifkan!", "#137333");
      }
    } catch (err) {
      showStatus("notif-status", "❌ Gagal: " + err.message, "#d93025");
    }
  });

  onMessage(messaging, (payload) => {
    simpanNotifikasi(payload.notification?.body || "Ada notifikasi baru");
  });
}

// =====================
// HELPER
// =====================
function showStatus(id, msg, color) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.color = color;
  setTimeout(() => el.textContent = "", 3000);
}

const notifList = [];
function simpanNotifikasi(pesan) {
  const waktu = new Date().toLocaleString("id-ID");
  notifList.unshift({ waktu, pesan });
  const tbody = document.getElementById("notif-body");
  if (!tbody) return;
  tbody.innerHTML = notifList.slice(0, 20).map(n =>
    `<tr><td>${n.waktu}</td><td>${n.pesan}</td></tr>`
  ).join("");
}