
// Bu dosyanın adı: server.js
// Render.com'a yüklenecek son hali. (Sağlık Kontrolü Eklendi)

const { Server } = require("socket.io");
const http = require('http'); // Node.js'in kendi HTTP modülünü dahil et

// 1. Render'ın sağlık kontrolü (health check) için basit bir HTTP sunucusu oluştur
const httpServer = http.createServer((req, res) => {
  // Render "GET /" isteği attığında ona "OK" (200) cevabı ver
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Arama santrali (WebSocket) sunucusu aktif.');
  } else {
    // Diğer tüm HTTP isteklerini reddet
    res.writeHead(404);
    res.end();
  }
});

// Render'ın bize verdiği portu (veya yerelde 3000'i) kullan
const PORT = process.env.PORT || 3000;

// 2. Socket.io'yu direkt porta DEĞİL, oluşturduğumuz HTTP sunucusuna bağla
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Test için herkes (Daha sonra sitenin adını yazarsın)
    methods: ["GET", "POST"]
  }
});

console.log(`🚀 Hatasız Arama Sunucusu (Santral) ${PORT} portunda dinlemeye hazır...`);

// =========================================================
// (Aşağıdaki tüm Socket.io mantığı öncekiyle BİREBİR AYNI)
// =========================================================

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

  // 2. ARAMA İSTEĞİ (dm_room -> dm_room)
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

  // 3. ARAMA KABUL EDİLDİ
  socket.on("call_accepted", (data) => {
    const callerSocketId = kullaniciSoketleri.get(data.caller_id.toString());
    if (callerSocketId) {
      console.log(`[KABUL] ${data.receiver_id} aramayı kabul etti. ${data.caller_id}'a bildiriliyor.`);
      io.to(callerSocketId).emit("call_was_accepted", {
        receiver_id: data.receiver_id
      });
    }
  });

  // 4. ARAMA REDDEDİLDİ
  socket.on("call_rejected", (data) => {
    const callerSocketId = kullaniciSoketleri.get(data.caller_id.toString());
    if (callerSocketId) {
      console.log(`[RED] ${data.receiver_id} aramayı reddetti.`);
      io.to(callerSocketId).emit("call_was_rejected", {
        receiver_id: data.receiver_id
      });
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

  // 7. BAĞLANTI KOPMASI
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

// 3. Sunucuyu normal io.listen() ile DEĞİL, httpServer.listen() ile başlat
httpServer.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda başarıyla başlatıldı.`);
});
