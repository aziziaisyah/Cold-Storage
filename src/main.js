import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, onValue,
  query, orderByChild, limitToLast,
  set, remove, push, get
} from "firebase/database";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, setPersistence, browserSessionPersistence
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

// Session hanya bertahan selama tab terbuka
setPersistence(auth, browserSessionPersistence);

// Flag untuk bedakan buka baru vs refresh
sessionStorage.setItem("aktif", "1");

let configData = { suhu_min: null, suhu_max: null };
let chart      = null;

// =====================
// AUTH
// =====================
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Kalau tidak ada flag = buka tab/window baru → logout paksa
    if (!sessionStorage.getItem("aktif")) {
      signOut(auth);
      return;
    }
    document.getElementById("halaman-login").style.display     = "none";
    document.getElementById("halaman-dashboard").style.display = "block";
    document.getElementById("user-email").textContent          = user.email;
    document.getElementById("user-email-mobile").textContent   = user.email;
    initDashboard();
  } else {
    document.getElementById("halaman-login").style.display     = "flex";
    document.getElementById("halaman-dashboard").style.display = "none";
  }
});

// LOGIN
document.getElementById("btn-login").addEventListener("click", async () => {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl  = document.getElementById("login-error");
  if (!email || !password) { errorEl.textContent = "⚠️ Email dan password harus diisi!"; return; }
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

// LOGOUT (desktop + mobile)
["btn-logout", "btn-logout-mobile"].forEach(id => {
  document.getElementById(id).addEventListener("click", async () => {
    sessionStorage.removeItem("aktif");
    await signOut(auth);
  });
});

// =====================
// INIT DASHBOARD
// =====================
function initDashboard() {

  // Sensor
  onValue(ref(db, "sensor"), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    document.getElementById("suhu").innerHTML = `${data.suhu}<span class="unit">°C</span>`;

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

    const pintuEl = document.getElementById("pintu");
    const isBuka  = data.pintu === "terbuka";
    pintuEl.textContent = isBuka ? "🔓 Terbuka" : "🔒 Tertutup";
    pintuEl.className   = `status-badge ${isBuka ? "buka" : "tutup"}`;
    if (isBuka) simpanNotifikasi("🚪 Pintu sedang terbuka");

    const peltierNyala = data.peltier === "nyala";
    document.getElementById("icon-peltier").className     = `device-icon ${peltierNyala ? "nyala" : "mati"}`;
    document.getElementById("status-peltier").textContent = peltierNyala ? "Nyala" : "Mati";
    document.getElementById("status-peltier").className   = `device-status ${peltierNyala ? "nyala" : "mati"}`;

    const kipasNyala = data.kipas === "nyala";
    document.getElementById("icon-kipas").className     = `device-icon ${kipasNyala ? "nyala" : "mati"}`;
    document.getElementById("status-kipas").textContent = kipasNyala ? "Nyala" : "Mati";
    document.getElementById("status-kipas").className   = `device-status ${kipasNyala ? "nyala" : "mati"}`;

    if (data.timestamp) {
      document.getElementById("timestamp").textContent =
        "Update terakhir: " + new Date(data.timestamp).toLocaleString("id-ID");
    }
  });

  // UID terakhir
  onValue(ref(db, "rfid/terakhir"), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    document.getElementById("uid-terakhir").textContent = data.uid || "--";
    if (data.waktu) document.getElementById("uid-waktu").textContent = new Date(data.waktu).toLocaleString("id-ID");
  });

  // Log RFID
  onValue(query(ref(db, "logs"), orderByChild("waktu"), limitToLast(10)), (snapshot) => {
    const tbody = document.getElementById("log-body");
    if (!snapshot.exists()) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Belum ada data</td></tr>`;
      return;
    }
    const logs = [];
    snapshot.forEach(child => logs.push({ key: child.key, ...child.val() }));
    logs.reverse();
    tbody.innerHTML = logs.map(log => {
      const waktu = log.waktu ? new Date(log.waktu).toLocaleString("id-ID") : "-";
      const sc    = log.status === "masuk" ? "masuk" : "ditolak";
      const sl    = log.status === "masuk" ? "✅ Masuk" : "❌ Ditolak";
      if (log.status === "ditolak") simpanNotifikasi(`🚫 Kartu tidak dikenal: ${log.uid}`);
      return `<tr>
        <td>${waktu}</td>
        <td><span style="font-family:monospace;letter-spacing:1px">${log.uid || "-"}</span></td>
        <td><span class="badge ${sc}">${sl}</span></td>
      </tr>`;
    }).join("");
  });

  // Histori suhu
  onValue(query(ref(db, "histori_suhu"), orderByChild("waktu"), limitToLast(20)), (snapshot) => {
    if (!snapshot.exists()) {
      document.getElementById("chart-empty").style.display = "block";
      document.getElementById("chart-suhu").style.display  = "none";
      document.getElementById("histori-body").innerHTML =
        `<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">Histori suhu kosong</td></tr>`;
      return;
    }
    const labels = [], dataGrafik = [], dataHistori = [];
    snapshot.forEach(child => {
      const d = child.val();
      labels.push(new Date(d.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
      dataGrafik.push(d.suhu);
      dataHistori.push(d);
    });

    document.getElementById("chart-empty").style.display = "none";
    document.getElementById("chart-suhu").style.display  = "block";
    const ctx = document.getElementById("chart-suhu").getContext("2d");
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = dataGrafik;
      chart.update();
    } else {
      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Suhu (°C)", data: dataGrafik,
            borderColor: "#1AABDD", backgroundColor: "rgba(26,171,221,0.08)",
            borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#1AABDD",
            tension: 0.4, fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { title: { display: true, text: "°C" }, grid: { color: "rgba(120,210,255,0.06)" } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    document.getElementById("histori-body").innerHTML = [...dataHistori].reverse().map(d => `
      <tr>
        <td>${new Date(d.waktu).toLocaleString("id-ID")}</td>
        <td style="font-weight:600;color:var(--blue-core)">${d.suhu}°C</td>
      </tr>`).join("");
  });

  // Config
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

  // Simpan config
  document.getElementById("btn-simpan").addEventListener("click", async () => {
    const suhuMin       = parseFloat(document.getElementById("suhu-min").value);
    const suhuMax       = parseFloat(document.getElementById("suhu-max").value);
    const durasiPeltier = parseFloat(document.getElementById("durasi-peltier").value);
    const durasiKipas   = parseFloat(document.getElementById("durasi-kipas").value);
    if ([suhuMin, suhuMax, durasiPeltier, durasiKipas].some(isNaN)) {
      showStatus("simpan-status", "⚠️ Semua kolom harus diisi!", "var(--danger-tx)"); return;
    }
    if (suhuMin >= suhuMax) {
      showStatus("simpan-status", "⚠️ Suhu min harus lebih kecil dari maks!", "var(--danger-tx)"); return;
    }
    try {
      await set(ref(db, "config"), {
        suhu_min: suhuMin, suhu_max: suhuMax,
        durasi_peltier: durasiPeltier, durasi_kipas: durasiKipas
      });
      showStatus("simpan-status", "✅ Pengaturan berhasil disimpan!", "var(--safe-tx)");
    } catch (err) {
      showStatus("simpan-status", "❌ Gagal: " + err.message, "var(--danger-tx)");
    }
  });

  // CRUD KARTU RFID
  onValue(ref(db, "authorized_cards"), (snapshot) => {
    const tbody = document.getElementById("kartu-body");
    if (!snapshot.exists()) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Belum ada kartu terdaftar</td></tr>`;
      return;
    }
    const rows = [];
    snapshot.forEach(child => {
      rows.push({ uid: child.key, nama: child.val()?.nama || "-" });
    });
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span style="font-family:monospace;letter-spacing:1px">${r.uid}</span></td>
        <td>${r.nama}</td>
        <td><button class="btn-hapus" onclick="hapusKartu('${r.uid}')">🗑 Hapus</button></td>
      </tr>`).join("");
  });

  // FCM
  document.getElementById("btn-notif").addEventListener("click", async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showStatus("notif-status", "❌ Izin notifikasi ditolak", "var(--danger-tx)"); return;
      }
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js")
      });
      if (token) {
        await set(ref(db, "fcm_token"), token);
        showStatus("notif-status", "✅ Notifikasi berhasil diaktifkan!", "var(--safe-tx)");
      }
    } catch (err) {
      showStatus("notif-status", "❌ Gagal: " + err.message, "var(--danger-tx)");
    }
  });

  onMessage(messaging, (payload) => {
    simpanNotifikasi(payload.notification?.body || "Ada notifikasi baru");
  });
}

// =====================
// CRUD FUNCTIONS (global)
// =====================
window.tambahKartu = async () => {
  const uid  = document.getElementById("input-uid").value.trim().toUpperCase();
  const nama = document.getElementById("input-nama").value.trim() || "-";
  if (!uid) { showStatus("rfid-status", "⚠️ UID tidak boleh kosong!", "var(--danger-tx)"); return; }
  try {
    await set(ref(db, `authorized_cards/${uid}`), { nama, ditambah: Date.now() });
    document.getElementById("input-uid").value  = "";
    document.getElementById("input-nama").value = "";
    showStatus("rfid-status", `✅ Kartu ${uid} berhasil ditambahkan!`, "var(--safe-tx)");
  } catch (err) {
    showStatus("rfid-status", "❌ Gagal: " + err.message, "var(--danger-tx)");
  }
};

window.hapusKartu = async (uid) => {
  if (!confirm(`Hapus kartu ${uid}?`)) return;
  try {
    await remove(ref(db, `authorized_cards/${uid}`));
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
};

window.hapusLogRFID = async () => {
  if (!confirm("Hapus semua log akses RFID?")) return;
  try {
    await remove(ref(db, "logs"));
    document.getElementById("log-body").innerHTML =
      `<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Belum ada data</td></tr>`;
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
};

window.hapusHistoriSuhu = async () => {
  if (!confirm("Hapus semua histori suhu?")) return;
  try {
    await remove(ref(db, "histori_suhu"));
    document.getElementById("histori-body").innerHTML =
      `<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">Histori suhu kosong</td></tr>`;
    if (chart) { chart.destroy(); chart = null; }
    document.getElementById("chart-empty").style.display = "block";
    document.getElementById("chart-suhu").style.display  = "none";
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
};

window.hapusNotifikasi = () => {
  notifList.length = 0;
  document.getElementById("notif-body").innerHTML =
    `<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:24px">Belum ada notifikasi</td></tr>`;
};

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