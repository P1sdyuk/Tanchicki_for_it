async function TestServer(_addr){
    try{
        const response = await fetch("http://" + _addr);
        if(!response.ok) {
            throw new Error(`Fetch error: ${response.status}`);
            return false;
        }
        const word = await response.json();
        if("secretWord" in word && word.secretWord === "TANCHIKI") return true;

        return false;
    }catch (error){
        console.error("TestServer: ", error.message);
        return false;
    }
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Vertex {
    constructor(points) {
        this.pts = structuredClone(points);
    }

    draw(ctx, color) {
        ctx.beginPath();
        ctx.moveTo(this.pts[0].x, this.pts[0].y);
        ctx.lineTo(this.pts[1].x, this.pts[1].y);
        ctx.lineTo(this.pts[2].x, this.pts[2].y);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

class Map {
    vertexes = [];

    constructor(file = null, canvas = null, w = 500, h = 500, LE = true) {
        if (file === null) return;
        const view = file;
        let size = view.getInt32(0, LE);
        
        for (let i = 0; i < size; i++) {
            let offset = 4 + i * 24;
            this.vertexes.push(new Vertex([
                new Point(view.getInt32(offset, LE) * canvas.width / w, view.getInt32(offset + 4, LE) * canvas.height / h),
                new Point(view.getInt32(offset + 8, LE) * canvas.width / w, view.getInt32(offset + 12, LE) * canvas.height / h),
                new Point(view.getInt32(offset + 16, LE) * canvas.width / w, view.getInt32(offset + 20, LE) * canvas.height / h)
            ]));
        }
    }

    drawVer(ctx, color) {
        try {
            // Исправлено: цикл с 0 и обращение через [] вместо .at()
            for (let i = 0; i < this.vertexes.length; i++) {
                this.vertexes[i].draw(ctx, color);
            }
        } catch (error) {
            console.error("Error drawing vertexes: ", error.message);
        }
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ СИСТЕМЫ КОЛЛИЗИЙ (SAT) ---
function getAxes(points) {
    let axes = [];
    for (let i = 0; i < points.length; i++) {
        let p1 = points[i];
        let p2 = points[(i + 1) % points.length];
        let edge = { x: p2.x - p1.x, y: p2.y - p1.y };
        let normal = { x: -edge.y, y: edge.x };
        let len = Math.hypot(normal.x, normal.y);
        if (len !== 0) axes.push({ x: normal.x / len, y: normal.y / len });
    }
    return axes;
}

function project(points, axis) {
    let min = Infinity, max = -Infinity;
    for (let p of points) {
        let dot = p.x * axis.x + p.y * axis.y;
        if (dot < min) min = dot;
        if (dot > max) max = dot;
    }
    return { min, max };
}

function checkSAT(poly1, poly2) {
    let axes = [...getAxes(poly1), ...getAxes(poly2)];
    for (let axis of axes) {
        let proj1 = project(poly1, axis);
        let proj2 = project(poly2, axis);
        if (proj1.max < proj2.min || proj2.max < proj1.min) {
            return false; 
        }
    }
    return true; 
}

function getRectangleVertices(x, y, w, h, angleDegrees) {
    let cx = x + w / 2;
    let cy = y + h / 2;
    // Добавляем -90 градусов к хитбоксу, чтобы он соответствовал визуальному повороту танка
    let rad = (angleDegrees - 90) * Math.PI / 180;
    let cos = Math.cos(rad);
    let sin = Math.sin(rad);

    let localPoints = [
        { x: -w/2, y: -h/2 },
        { x: w/2,  y: -h/2 },
        { x: w/2,  y: h/2 },
        { x: -w/2, y: h/2 }
    ];

    return localPoints.map(p => ({
        x: cx + (p.x * cos - p.y * sin),
        y: cy + (p.x * sin + p.y * cos)
    }));
}


class Player {
    constructor(team, canvas, x = 0, y = 0) {
        this.img = new Image();
        this.img.src = team ? "resources/assets/blueTank.png" : "resources/assets/redTank.png";
        this.x = x;
        this.y = y;
        
        // Уменьшили размеры вдвое (было 32, стало 16)
        this.w = 16 * canvas.width / 500;
        this.h = 16 * canvas.height / 500;
        
        this.a = 90; // Угол в градусах
        this.team = team;
        this.alive = true;
        this.name = Name;
    }

    draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    // Добавляем -90 градусов (-Math.PI / 2), чтобы довернуть текстуру танка прямо по вектору движения
    ctx.rotate((this.a - 90) * Math.PI / 180);
    ctx.drawImage(this.img, -this.w / 2, -this.h / 2, this.w, this.h);
    ctx.restore();

    // Отрисовка имени над танком
    ctx.fillStyle = this.team ? "#3399ff" : "#ff3333";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.name, this.x + this.w / 2, this.y - 6);
    }

    getBounds() {
        return getRectangleVertices(this.x, this.y, this.w, this.h, this.a);
    }

    handleInput(keyCode) {
        if (!this.alive) return;
        let oldX = this.x;
        let oldY = this.y;
        let speed = 2.5; // Немного снизим скорость для плавности в узких проходах

        // В JS Math.sin/cos принимают радианы. 
        // В вашей раскладке W двигает танк вперед относительно его угла
        switch(keyCode.toLowerCase()) {
            case "w":
                this.y -= speed * Math.sin(this.a * Math.PI / 180);
                this.x -= speed * Math.cos(this.a * Math.PI / 180);
                break;
            case "s":
                this.y += speed * Math.sin(this.a * Math.PI / 180);
                this.x += speed * Math.cos(this.a * Math.PI / 180);
                break;
            case "a":
                this.a -= 4; // Скорость поворота
                break;
            case "d":
                this.a += 4;
                break;
            case "e":
                this.shoot();
                break;
        }

        // Проверка столкновения с геометрией карты (SAT)
        let playerPoly = this.getBounds();
        for (let vertex of map.vertexes) {
            if (checkSAT(playerPoly, vertex.pts)) {
                this.x = oldX;
                this.y = oldY;
                break;
            }
        }
    }

    shoot() {
        if (!window.gameSocket) return;
        let rad = this.a * Math.PI / 180;
        
        let vx = -Math.cos(rad) * 5;
        let vy = -Math.sin(rad) * 5;
        
        let bx = this.x + this.w / 2 - 2;
        let by = this.y + this.h / 2 - 2;

        // Выделяем буфер под выровненную структуру (24 байта)
        let bBuffer = new ArrayBuffer(24);
        let bView = new DataView(bBuffer);
        
        bView.setUint8(0, 2); // type = 2
        // Пишем данные со смещения 4, соблюдая структуру C++
        bView.setFloat32(4, bx, true);
        bView.setFloat32(8, by, true);
        bView.setFloat32(12, vx, true);
        bView.setFloat32(16, vy, true);
        bView.setUint8(20, this.team);

        window.gameSocket.send(bBuffer);
        
        // Добавляем пулю себе в локальный список
        bullets.push(new Bullet(this.team, bx, by, vx, vy));
    }

    die() {
        this.alive = false;
        sendMyPosition(); 
        window.alert("Вы погибли!");
    }
}

class Bullet {
    constructor(team, x, y, vx, vy) {
        this.img = new Image();
        this.img.src = team ? "resources/assets/blueBullet.png" : "resources/assets/redBullet.png";
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.w = 4; // Уменьшили пулю под размер танка
        this.h = 4;
        this.team = team;
        this.toRemove = false;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        let bulletPoly = getRectangleVertices(this.x, this.y, this.w, this.h, 0);

        for (let vertex of map.vertexes) {
            if (checkSAT(bulletPoly, vertex.pts)) {
                this.toRemove = true;
                return;
            }
        }

        if (player && player.alive && this.team !== player.team) {
            if (checkSAT(bulletPoly, player.getBounds())) {
                player.die();
                this.toRemove = true;
                return;
            }
        }
    }

    draw(ctx) {
        ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    }
}