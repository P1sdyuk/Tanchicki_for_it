let address = null;
const screen = document.getElementById("screen");
const ctx = screen.getContext("2d");
let map = new Map();


// --- Инициализация Player var ---
const inputName = document.getElementById("playerName");

// Исправлено: Объявляем переменную ОДИН раз. Проверяем куки, если пусто — генерируем случайное имя
let savedName = getCookie("tankPlayerName");
let Name = savedName ? savedName : "user" + Math.floor(Math.random() * 10000);

let player = null;

let remotePlayers = {}; 
let bullets = [];
let myId = null;
// Сразу устанавливаем имя в инпут при загрузке страницы
if (inputName) {
    inputName.value = Name;
}

function DrawAll() {
    map.drawVer(ctx, "black");
    
    // Обновляем и рисуем пули с конца массива
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        if (bullets[i].toRemove) {
            bullets.splice(i, 1);
        } else {
            bullets[i].draw(ctx);
        }
    }

    // Флаг, который показывает, есть ли еще живые враги на карте
    let enemyAlive = false;

    // Рисуем остальных игроков и проверяем их команду
    for (let id in remotePlayers) {
        let remotePlayer = remotePlayers[id];
        remotePlayer.draw(ctx);

        // Если у игрока в списке ДРУГАЯ команда, значит враг еще жив
        if (player && remotePlayer.team !== player.team) {
            enemyAlive = true;
        }
    }

    // Рисуем нашего игрока
    if (player && player.alive) {
        player.draw(ctx);
        sendMyPosition(); 
    }

    // ЕСЛИ ВРАГОВ НЕ ОСТАЛОСЬ — ВЫВОДИМ НАДПИСЬ О ПОБЕДЕ
    // Проверяем, что мы сами живы и на карте вообще был хоть кто-то, кроме нас
    if (player && player.alive && !enemyAlive && Object.keys(remotePlayers).length > 0) {
        ctx.save();
        
        // Полупрозрачный темный фон для эффекта финала
        ctx.fillStyle = "rgba(11, 7, 19, 0.65)";
        ctx.fillRect(0, 0, screen.width, screen.height);

        // Настройка неонового светящегося текста
        ctx.font = "bold 40px 'Segoe UI', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Зеленое неоновое свечение (в стиле вашей CSS-верстки)
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00ff66";
        ctx.fillStyle = "#00ff66";
        
        ctx.fillText("ВЫ ПОБЕДИЛИ!", screen.width / 2, screen.height / 2);
        ctx.restore();
    }
}

async function INIT_() {
    const testRes = await TestServer(address);
    if (testRes) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket("ws://" + address + "/ws");
            socket.binaryType = 'arraybuffer'; 

            socket.onopen = (event) => {
                socket.send("\0" + Name);
                resolve(socket); 
            };

            socket.onerror = (error) => {
                console.error("WebSocket Error:", error);
                reject(error);
            };
        });
    } else {
        return null;
    }
}

function setNetworkCallbacks(socket) {
    socket.onmessage = function(event) {
        let packet = new DataView(event.data);
        if (packet.byteLength === 0) return;
        
        let type = packet.getUint8(0);
        switch(type) {
            case 0: // Инициализация нашего игрока от сервера
                myId = packet.getInt32(1, true);
                let team = packet.getUint8(5);
                
                let spawnX = (team === 1) ? 40 : 440;
                let spawnY = (team === 1) ? 40 : 440;
                
                let canvasSpawnX = spawnX * screen.width / 500;
                let canvasSpawnY = spawnY * screen.height / 500;

                player = new Player(team, screen, canvasSpawnX, canvasSpawnY);
                break;

            case 1: // Позиция другого игрока (Пакет весит 56 байт из-за выравнивания в C++)
                if (packet.byteLength < 56) return;
                
                let rId = packet.getInt32(4, true);       // Смещение 4 (после type + 3 байта паддинга)
                let rx = packet.getFloat32(8, true);       // Смещение 8
                let ry = packet.getFloat32(12, true);      // Смещение 12
                let rangle = packet.getFloat32(16, true);  // Смещение 16
                let rteam = packet.getUint8(20);           // Смещение 20
                let ralive = packet.getUint8(21);          // Смещение 21
                
                // Имя начинается строго с 24-го байта (после 20 байт данных + 4 байта выровненного блока team/alive)
                let nameBytes = new Uint8Array(event.data, 24, 32); 
                let rname = new TextDecoder("utf-8").decode(nameBytes).replace(/\0/g, '').trim();

                if (ralive === 0) {
                    delete remotePlayers[rId];
                } else {
                    let enemy = remotePlayers[rId];
                    if (!enemy) {
                        enemy = new Player(rteam, screen, rx, ry);
                        remotePlayers[rId] = enemy;
                        console.log(`Добавлен игрок ID: ${rId}, Имя: ${rname}`);
                    }
                    enemy.x = rx;
                    enemy.y = ry;
                    enemy.a = rangle;
                    enemy.name = rname ? rname : "Враг";
                }
                break;

            case 2: // Создание чужой пули (Структура весит 24 байта из-за паддинга в C++)
                if (packet.byteLength < 24) return;
                
                // Читаем со смещением 4 (пропуская тип и 3 байта паддинга)
                let bx = packet.getFloat32(4, true);
                let by = packet.getFloat32(8, true);
                let bvx = packet.getFloat32(12, true);
                let bvy = packet.getFloat32(16, true);
                let bteam = packet.getUint8(20); // Флаг команды на 20-м байте

                bullets.push(new Bullet(bteam, bx, by, bvx, bvy));
                break;

            default: 
                map = new Map(packet, screen, 500, 500, true);
                break;
        }
    } 
}

function sendMyPosition() {
    if (!window.gameSocket || !player || myId === null) return;
    
    let buffer = new ArrayBuffer(56); // Выравниваем до 56 байт
    let view = new DataView(buffer);
    
    view.setUint8(0, 1); 
    view.setInt32(4, myId, true);        // Пишем на смещение 4
    view.setFloat32(8, player.x, true);   // Пишем на смещение 8
    view.setFloat32(12, player.y, true);  // Пишем на смещение 12
    view.setFloat32(16, player.a, true);  // Пишем на смещение 16
    view.setUint8(20, player.team);       // Пишем на смещение 20
    view.setUint8(21, player.alive ? 1 : 0); // Пишем на смещение 21

    let encoder = new TextEncoder();
    let nameUint8 = encoder.encode(Name);
    
    // Копируем имя строго начиная с 24-го байта
    for (let i = 0; i < 32; i++) {
        let byteValue = (i < nameUint8.length) ? nameUint8[i] : 0;
        view.setUint8(24 + i, byteValue);
    }
    
    window.gameSocket.send(buffer);
}

function MAIN_() { 
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.fillRect(0, 0, screen.width, screen.height);

    DrawAll();

    requestAnimationFrame(MAIN_);
}

async function StartGame() {
    const socket = await INIT_();
    if (socket) {
        console.log("Game started successfully.");
        setNetworkCallbacks(socket);
        window.gameSocket = socket; 
        requestAnimationFrame(MAIN_);
    } else {
        console.error("Failed to connect to the tank server.");
    }
}

document.addEventListener('keydown', (event) => {
    player?.handleInput(event.key);
});

// Обработка интерфейса Gemini
startGameBtn.addEventListener('click', async () => {
    if(address === null) {
        window.alert("Server not set");
        return;
    }
    upperPanel.classList.add('hidden');
    startGameBtn.style.display = 'none';
    menuToggle.classList.remove('active');
    sidebar.classList.remove('active');
    canvasWrapper.classList.add('active');

    StartGame();
});

document.getElementById("connect").addEventListener("click", async function(){
    const addr = new String(serverUrlInput.value.trim());
    let out = addr.length < 1 ? "noAddressSet" : addr;

    currentServerSpan.textContent = out;
    address = out === "noAddressSet" ? null : out;
    
    const testRes = await TestServer(address);
    if(!testRes){
        window.alert(`Server on ${address} not found`);
        address = null;
    }
});

// Изменяем обработчик ввода имени: теперь он сохраняет ник в куки на 365 дней
inputName.addEventListener("keydown", function(event){
    if (event.key === "Enter") {
        let trimmedName = inputName.value.trim();
        if (trimmedName.length > 0) {
            Name = trimmedName;
            setCookie("tankPlayerName", Name, 365); // Сохраняем в куки на год
            console.log("Name changed and saved to cookies:", Name);
        }
    }
});