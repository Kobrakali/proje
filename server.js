
// Bu dosyanın adı: server.js
// Render.com'un "Zaman Aşımı" hatasını çözen ve "Reddetme" sinyalini düzelten son versiyon.
// 🔥 YENİ: Admin paneli istatistik özelliği eklendi.

const { Server } = require("socket.io");
const http = require('http'); 

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Arama santrali (WebSocket) sunucusu aktif.');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Test için herkes
    methods: ["GET", "POST"]
  }
});

console.log(`🚀 Hatasız Arama Sunucusu (Santral) ${PORT} portunda dinlemeye hazır...`);

let kullaniciSoketleri = new Map(); // key: userId, value: socket.id

io.on("connection", (socket) => {
  console.log(`[BAĞLANTI] Bir kullanıcı bağlandı: ${socket.id}`);

  // 1. KULLANICI KİMLİĞİNİ KAYDETME
  socket.on("store_user_id", (userId) => {
    if (!userId) return;
    const userIdStr = userId.toString();
    console.log(`[KİMLİK] Kullanıcı ${userIdStr} soket ${socket.id} ile eşleşti.`);
    kullaniciSoketleri.set(userIdStr, socket.id);
  });

  // 2. ARAMA İSTEĞİ (dm_room -> incoming_call)
  socket.on("request_call", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[İSTEK] ${data.caller_id} -> ${data.receiver_id} için arama isteği iletiliyor.`);
      io.to(receiverSocketId).emit("incoming_call_request", {
        caller_id: data.caller_id,
        call_type: data.call_type
      });
    } else {
      console.log(`[HATA] ${data.receiver_id} çevrimiçi değil. Arama isteği iletilemedi.`);
    }
  });

  // 3. ARAMA KABUL EDİLDİ (JS tarafında kullanılmıyor, ama zararı yok)
  socket.on("call_accepted", (data) => {
    const callerSocketId = kullaniciSoketleri.get(data.caller_id.toString());
    if (callerSocketId) {
      console.log(`[KABUL] ${data.receiver_id} aramayı kabul etti. ${data.caller_id}'a bildiriliyor.`);
      io.to(callerSocketId).emit("call_was_accepted", {
        receiver_id: data.receiver_id
      });
    }
  });

  // 4. ARAMA REDDEDİLDİ (incoming_call.php ile uyumlu)
  socket.on("send_rejection", (data) => {
    const callerSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (callerSocketId) {
      console.log(`[RED] Arama reddedildi. ${data.receiver_id}'a (Arayana) bildiriliyor.`);
      io.to(callerSocketId).emit("call_was_rejected");
    } else {
      console.log(`[HATA] Red sinyali iletilemedi. Arayan (${data.receiver_id}) çevrimdışı.`);
    }
  });
  
  // 5. GENEL WEBRTC SİNYAL İLETİMİ (call_room -> call_room)
  socket.on("send_signal", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[SİNYAL] ${data.payload.type} sinyali ${data.receiver_id}'a iletiliyor.`);
      io.to(receiverSocketId).emit("incoming_signal", {
        payload: data.payload
      });
    }
  });

  // 6. ARAMA KAPATMA
  socket.on("send_hangup", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[KAPAT] ${data.receiver_id}'a kapatma sinyali iletiliyor.`);
      io.to(receiverSocketId).emit("call_ended_by_peer");
    }
  });

  // 🔥 GÜNCELLEME: ADMİN PANELİ İSTATİSTİK İSTEĞİ EKLENDİ
  // 7. ADMİN PANELİ İSTATİSTİK İSTEĞİ
  socket.on("admin_get_stats", (secret_key) => {
    // Şifreyi kontrol et (Bu şifreyi panel/index.php'deki ile aynı yap)
    if (secret_key === "CokGuvEnliSifre123") { 
      
      console.log("[ADMIN] İstatistik isteği alındı.");
      // Admin'e o an bağlı olan soket sayısını (kullaniciSoketleri listesinin boyutu) gönder
      socket.emit("admin_stats_response", { 
        active_count: kullaniciSoketleri.size 
      });
      
    } else {
      console.warn("[ADMIN] YETKİSİZ İstatistik isteği denemesi!");
    }
  });

  // 8. BAĞLANTI KOPMASI
  socket.on("disconnect", () => {
    console.log(`[BAĞLANTI KESİLDİ] Kullanıcı ayrıldı: ${socket.id}`);
    for (let [userId, sockId] of kullaniciSoketleri.entries()) {
      if (sockId === socket.id) {
        kullaniciSoketleri.delete(userId);
        console.log(`[KİMLİK] Kullanıcı ${userId} eşleşmesi kaldırıldı.`);
        break;
      }
    }
  });
});

// 3. Sunucuyu '0.0.0.0' hostu ile başlat
httpServer.listen(PORT, HOST, () => {
  console.log(`Sunucu ${PORT} portunda ${HOST} hostunda başarıyla başlatıldı.`);
});
