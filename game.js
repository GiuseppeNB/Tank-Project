//=======================
//FRONTEND DO JOGO
//-----------------------
//Este arquivo cuida apenas do navegador
//1. Le eventos de teclado
//2. Envia comandos para o backend
//3. Recebe o estado atual da partida
//4. Desenha tudo no Canvas

const { text } = require("node:stream/consumers");

//A regra do jogo fica no server.js. Essa separação ajuda a mostrar a diferença entre DOM/eventos no cliente e estado no servidor.
//=======================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const homeScreen = document.getElementById("screen-home");
const gameScreen = document.getElementById("screen-game");
const endScreen = document.getElementById("screen-end");
const nickForm = document.getElementById("nick-form");

const nickInput = document.getElementById("nick-input");
const statusMessage = document.getElementById("status-message");
const hostIpLabel = document.getElementById("host-ip-label");
const connectionLabel = document.getElementById("connection-label")
const playerLabel = document.getElementById("player-label");
const scoreLabel = document.getElementById("socre-label");
const endTitle = document.getElementById("end-title");
const restartButton = document.getElementById("restart-button");
const backButton = document.getElementById("back-button");

//O navegador guarda quais teclas estão pressionadas no momento
//O backend recebe somente um resumo: girando para esquerda/direita, andando para frente/trás e atirando
let keys = {};

let myPlayerId = null;
let latestState = null;
let lastShotAt = 0;
let pollingTimer = null;
let inputTimer = null;

function showScreen(screen) {
    homeScreen.classList.add("hidden"); //Adiciona a class "hidden" ao homeScreen, escondendo essa section
    gameScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    screen.classList.remove("hidden");
}

function setStatus(message) {
    statusMessage.textContent = message;
}

function updateHostIps(ips) {
    if (!ips || ips.length === 0) {
        hostIpLabel.textContent = "IP do servidor: abra este projeto com node server.js";
        return;
    }

    const links = ips.map((ip) => `http://$(ip):3000`).join("  |  ");
    hostIpLabel.textContent = `Para jogar em rede local, outro jogador pode abrir: $(links)`;
}

async function requestJson(url, options = {}) { // quando executa async ele fura a fila para ler a coisa, ele desincroniza.
    const response = await fetch(url, options);
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Erro HTTP ${response.status}`); // se der erro não pare a execução do programa(throw)
    }

    return response.json();
}

async function loadServerInfo() {
    try {
        const info = await requestJson("/api/info");
        updateHostIps(info.hostIps);
    } catch (error) {
        hostIpLabel.textContent = "Backend não encontrado. Inicie com: node server.js";
    }
}

async function joinGame(nick) {
    const data = await requestJson("/api/join", {
        method: "POST", 
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({nick})
    });

    myPlayerId = data.playerId;
    latestState = data.state;
    updateHud();
    drawScene();
}

function updateHud() {
    if (!latestState) return;

    const me = latestState.tanks.find((tank) => tank.id === myPlayerId); // Retorna true ou false. Atribuidor ternário
    playerLabel.textContent = me
    ? `Voce: ${me.nick} (Tanque ${me.id})` // é tipo um if else, o if vai ser o ? e o else é :. O teste vai ser se o playerLabel.textContext = me e o me retorna true ou false
    : "Voce: espectador";

    scoreLabel.textContent = `Placar: ${latestState.score[1]} x ${latestState.score[2]}`;

    const connected = latestState.tanks.filter((tank) => tank.connected).length;
    connectionLabel.textContent = `Jogadores conectados: ${connected}/2`;
}

//Gera um pacote pequeno com o estado atual dos controles
//A/D e setas laterais giram o tanque 
//W/S e setas verticais movem para frente/trás na direção atual

function buildInputPayload() {
    const turningLeft = keys.a || keys.A || keys.ArrowLeft;
    const turningRight = keys.d || keys.D || keys.ArrowRight;
    const movingForward = keys.w || keys.W || keys.ArrowUp;
    const movingBackward = keys.s || keys.S || keys.ArrowDown;

    const wantsToShot = keys[" "] && performance.now() - lastShotAt > 250;
    if (wantsToShot) lastShotAt = performance.now();

    return {
        playerId: myPlayerId,
        input: {
            turn: Number(turningRight) - Number(turningLeft),
            move: Number(movingForward) - Number(movingBackward),
            shoot: wantsToShot
        }
    };
}

async function sendInput() {
    if (!myPlayerId) return;

    try { //Se tem algo que pode dar um erro fatal, tentar lê alguma coisa e não conseguir gera erro. O que eu vejo o que pode dar erro coloca dentro de um try pois se der erro ele 
        await requestJson("/api/input", { //não para
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify(buildInputPayload())
        });
    } catch (error) { //O catch fala para pegar o erro e fazer alguma coisa. Nesse caso é "Servidor desconectado"
        connectionLabel.textContent = "Servidor desconectado";
    }
}

async function pollState() {
    try {
        latestState = await requestJson("/api/state");
        updateHud();

        if (latestState.winnerId) {
            const winner = latestState.tanks.find((tank) => tank.id === latestState.winnerId);
            endTitle.textContent = `Vitória de ${winner ? winner.nick : "um jogador"}`;
            showScreen(endScreen);
        }
    } catch (error) {
        connectionLabel.textContent = "Servidor desconectado";
    }
}

function startNetworkLoop() {
    clearInterval(inputTimer);
    clearInterval(pollingTimer);

    //Em uma aula, esses intervalos deixam claro que o navegador envia comandos e busca o estado do sevidor várias vezes por segundo
    inputTimer = setInterval(sendInput, 33);//Começa a executar o sendInput a cada 33 milisegundos e cria um loop
    pollingTimer = setInterval(pollState, 33);//Começa a executar o pollState a cada 33 milisegundos e cria um loop
}

function leaveGame() {
    if (!myPlayerId) return;

    const payload = JSON.stringify({playerId: myPlayerId});

    //sendBeacon é útil quando a aba esta fechando, pois o navegador tenta enviar a mensagem sem bloquear o fechamento da página
    if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/leave", new Blob([payload], { type: "application;json"}));
    } else {
        fetch("/api/leave",{
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true
        });
    }
}

function drawArena() {
    ctx.fillStyle = "#172033";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(125, 211, 252, 0.12)";
    ctx.linewidth = 1;

    for (let x = 0; x <= canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo();
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawWalls() {
    if (!latestState) return;

    ctx.fillStyle = "#64748b";
    ctx.strokeStyle = "#cbd5e1";
    ctx.linewidth = 2;

    for (const wall of latestState.walls) {
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }
}

function drawTank(tank) {
    ctx.save();//Salva todo o contexto, todos os desehos. No Canvas não consigo fazer nada girar

    const centerX = tank.x + tank.width/2;
    const centerY = tank.y + tank.height/2;

    //Para girar um desenho no Canvas, movemos a origem para o centro do tanque, rotacionamos o contexto e desenhamos o tanque em torno desse novo centro. Depois, ctx.restore() desfaz a transformação.
    ctx.translate(centerX, centerY);
    ctx.rotate(tank.angle);

    ctx.fillStyle = tank.color;
    ctx.strokeStyle = tank.id === myPlayerId ? "#facc15" : "#0f172a";
    ctx.linewidth = tank.id === myPlayerId ? 4 : 2;

    ctx.fillRect(-tank.width/2, -tank.height/2, tank.width, tank.height);
    ctx.strokeRect(-tank.width/2, -tank.height/2, tank.width, tank.height);

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(8, -5, 30, 10);

    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(-18, -20, 10, 40);
    ctx.fillRect(8, -20, 10, 40);

    ctx.restore();
}

function drawNick(tank) {
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bond 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(tank.nick, tank.x + tank.width/2, tank.y - 8);
    ctx.textAlign = "left";
}

function drawBullets() {
    if (!latestState) return;

    ctx.fillStyle = "#fde047";
    for (const bullet of latestState.bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawScene() {
    drawArena();
    drawWalls();

    if (latestState) {
        for (const tank of latestState.tanks) {
            drawTank(tank);
            drawNick(tank);
        }
    }

    drawBullets();
}

function animationLoop() {
    drawScene();
    requestAnimationFrame(animationLoop);
}