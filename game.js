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