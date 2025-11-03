const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const messageBox = document.getElementById('message-box');

// --- IDs DE UI ACTUALIZADOS ---
const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');

let animationFrameId;
let lastTime = 0;

// --- Variables de Dificultad (Basadas en Puntuación) ---
const BASE_SPAWN_INTERVAL = 1500; // 1.5 segundos
let currentSpawnInterval = BASE_SPAWN_INTERVAL;
let timeSinceLastAsteroid = BASE_SPAWN_INTERVAL;
const SCORE_DIFFICULTY_THRESHOLD = 500; // Cada 500 puntos
let currentScoreDifficultyLevel = 0;
const MIN_SPAWN_INTERVAL = 300; // Límite (0.3s)
let baseAsteroidSpeed = 1.0; // Multiplicador de velocidad base

// Constantes y estado del juego
const GAME_WIDTH = 600;
const GAME_HEIGHT = 900; 
let gameRunning = false;
let score = 0;
let lives = 3;

// TEMPORIZADOR DE CONCENTRACIÓN
let startTime = 0;
let endTime = 0;

// ESTADO ZEN 
let zenLevel = 1; 

// Estado de la respiración
let breathingTimeoutId = null;
const BREATHING_PHASES = ['INHALAR', 'SOSTENER', 'EXHALAR', 'PAUSAR']; 
let currentPhaseIndex = 0;
const PHASE_DURATION_MS = 5000; // 5 segundos por fase (20s ciclo total)
const PHASE_DURATION_SECONDS = PHASE_DURATION_MS / 1000; // 5 segundos

// --- TUTORIAL DE CALIBRACIÓN ---
let tutorialActive = false;
let tutorialPhaseIndex = 0;
let tutorialTimeRemaining = 5;
let tutorialIntervalId = null;

// --- AUDIO DE MÚSICA DE FONDO ---
const backgroundMusic = new Audio('assets/cancion.mp3');
backgroundMusic.loop = true; // Repetir en bucle automáticamente
backgroundMusic.volume = 0.3; // Volumen al 30%

// Iniciar música al cargar la página
backgroundMusic.play().catch(() => {});


// Redimensionar el canvas para ajustarse al contenedor
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// Manejo de entrada
const keys = { left: false, right: false, space: false }; // space se activará automáticamente
let targetShipX = GAME_WIDTH / 2; // Posición X objetivo para la nave

// --- LISTENERS DE CONTROL TÁCTIL/MOUSE EN EL CANVAS ---

function getEventX(e) {
    const rect = canvas.getBoundingClientRect();
    let touch = e.touches ? e.touches[0] : e;
    let scale = GAME_WIDTH / rect.width;
    return (touch.clientX - rect.left) * scale;
}

function moveShip(e) {
    if (!gameRunning) return;
    e.preventDefault(); // Prevenir scroll en móvil
    targetShipX = getEventX(e);
}

canvas.addEventListener('mousedown', (e) => {
    if(gameRunning) gameContainer.style.cursor = 'grabbing';
    moveShip(e);
});
canvas.addEventListener('mouseup', () => {
    if(gameRunning) gameContainer.style.cursor = 'grab';
});
canvas.addEventListener('mouseleave', () => {
    if(gameRunning) gameContainer.style.cursor = 'grab';
});
canvas.addEventListener('mousemove', moveShip);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    moveShip(e);
}, { passive: false });
canvas.addEventListener('touchmove', moveShip, { passive: false });


// --- LISTENERS DE TECLADO (Mantenidos como alternativa) ---
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

// --- Lógica de Respiración de Caja ---
function updateBreathingPhase() {
    const phaseName = BREATHING_PHASES[currentPhaseIndex];
    
    gameContainer.classList.remove('breathing-inhale', 'breathing-hold1', 'breathing-exhale', 'breathing-hold2');

    if (phaseName === 'INHALAR') {
        gameContainer.classList.add('breathing-inhale');
    } else if (phaseName === 'SOSTENER') {
        gameContainer.classList.add('breathing-hold1');
    } else if (phaseName === 'EXHALAR') {
        gameContainer.classList.add('breathing-exhale');
    } else if (phaseName === 'PAUSAR') {
        gameContainer.classList.add('breathing-hold2');
    }

    currentPhaseIndex = (currentPhaseIndex + 1) % BREATHING_PHASES.length;

    if (gameRunning) {
        breathingTimeoutId = setTimeout(updateBreathingPhase, PHASE_DURATION_MS);
    }
}

function startBreathing() {
    zenLevel = 1;

    if (breathingTimeoutId) clearTimeout(breathingTimeoutId);
    currentPhaseIndex = 0; 
    updateBreathingPhase(); 
}

function stopBreathing() {
    if (breathingTimeoutId) clearTimeout(breathingTimeoutId);
    
    gameContainer.classList.remove('breathing-inhale', 'breathing-hold1', 'breathing-exhale', 'breathing-hold2');
    gameContainer.style.borderColor = ''; 
    gameContainer.style.boxShadow = '';
}

// --- TUTORIAL DE CALIBRACIÓN ---
function startTutorial() {
    tutorialActive = true;
    tutorialPhaseIndex = 0;
    tutorialTimeRemaining = 5;
    
    runTutorialPhase();
    
    // Iniciar loop de renderizado del tutorial
    tutorialRenderLoop();
}

function tutorialRenderLoop() {
    if (!tutorialActive) return;
    
    // Limpiar canvas y redibujar
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    if (tutorialPhaseIndex < BREATHING_PHASES.length) {
        const phaseName = BREATHING_PHASES[tutorialPhaseIndex];
        
        // Texto grande con la fase
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 60px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 20;
        ctx.fillText(phaseName, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);
        
        // Cuenta regresiva
        ctx.font = 'bold 80px Orbitron';
        ctx.fillStyle = '#00ffaa';
        ctx.shadowColor = 'rgba(0, 255, 170, 0.8)';
        ctx.fillText(tutorialTimeRemaining, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
        ctx.restore();
    }
    
    requestAnimationFrame(tutorialRenderLoop);
}

function runTutorialPhase() {
    if (tutorialPhaseIndex >= BREATHING_PHASES.length) {
        // Tutorial completado
        endTutorial();
        return;
    }
    
    const phaseName = BREATHING_PHASES[tutorialPhaseIndex];
    
    // Aplicar el estilo visual de la fase
    gameContainer.classList.remove('breathing-inhale', 'breathing-hold1', 'breathing-exhale', 'breathing-hold2');
    if (phaseName === 'INHALAR') {
        gameContainer.classList.add('breathing-inhale');
    } else if (phaseName === 'SOSTENER') {
        gameContainer.classList.add('breathing-hold1');
    } else if (phaseName === 'EXHALAR') {
        gameContainer.classList.add('breathing-exhale');
    } else if (phaseName === 'PAUSAR') {
        gameContainer.classList.add('breathing-hold2');
    }
    
    // Iniciar cuenta regresiva
    tutorialTimeRemaining = 5;
    if (tutorialIntervalId) clearInterval(tutorialIntervalId);
    
    tutorialIntervalId = setInterval(() => {
        tutorialTimeRemaining--;
        
        if (tutorialTimeRemaining <= 0) {
            clearInterval(tutorialIntervalId);
            tutorialPhaseIndex++;
            runTutorialPhase();
        }
    }, 1000);
}

function endTutorial() {
    if (tutorialIntervalId) clearInterval(tutorialIntervalId);
    
    // Guardar en localStorage que ya vio el tutorial
    localStorage.setItem('haVistoElTutorial', 'true');
    
    // Mostrar mensaje final durante 2 segundos
    let finalMessageTime = 0;
    const finalMessageDuration = 2000; // 2 segundos
    const startFinalTime = performance.now();
    
    function renderFinalMessage() {
        finalMessageTime = performance.now() - startFinalTime;
        
        if (finalMessageTime < finalMessageDuration) {
            ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            
            ctx.save();
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 40px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
            ctx.shadowBlur = 20;
            ctx.fillText('¡LISTO!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
            ctx.font = 'bold 28px Orbitron';
            ctx.fillText('Ahora, mantén el ritmo.', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
            ctx.restore();
            
            requestAnimationFrame(renderFinalMessage);
        } else {
            // Terminar tutorial y empezar juego
            tutorialActive = false;
            gameContainer.classList.remove('breathing-inhale', 'breathing-hold1', 'breathing-exhale', 'breathing-hold2');
            startActualGame();
        }
    }
    
    renderFinalMessage();
}

function startActualGame() {
    resetGame();
    gameRunning = true;
    lastTime = performance.now();
    gameContainer.style.cursor = 'grab';
    
    if (backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {});
    }
    
    startBreathing();
    gameLoop(lastTime);
}

// --- Clases de Juego ---

class Ship {
    constructor() {
        this.width = 40;
        this.height = 30;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - this.height - 50; 
        this.speed = 8; // Velocidad para el teclado (de repuesto)
        this.laserCooldown = 200; // ms
        this.lastShotTime = 0;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = '#00ffff'; 
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y); 
        ctx.lineTo(this.x, this.y + this.height);    
        ctx.lineTo(this.x + this.width, this.y + this.height); 
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    update(deltaTime) {
        if (keys.left) {
            this.x -= this.speed;
            targetShipX = this.x + this.width / 2; 
        } else if (keys.right) {
            this.x += this.speed;
            targetShipX = this.x + this.width / 2; 
        } else {
            // Moverse suavemente (lerp) a la posición del táctil/mouse
            const newX = this.x + (targetShipX - (this.x + this.width / 2)) * 0.2;
            this.x = newX;
        }

        // --- MANTENER LÍMITES ---
        if (this.x < 0) {
            this.x = 0;
            targetShipX = this.width / 2;
        }
        if (this.x + this.width > GAME_WIDTH) {
            this.x = GAME_WIDTH - this.width;
            targetShipX = GAME_WIDTH - this.width / 2;
        }

        // --- LÓGICA DE DISPARO (AUTOMÁTICO) ---
        if (keys.space) { // keys.space se establece en true en resetGame()
            const now = performance.now();
            if (now - this.lastShotTime > this.laserCooldown) {
                lasers.push(new Laser(this.x + this.width / 2));
                this.lastShotTime = now;
            }
        }
    }
}

class Laser {
    constructor(startX) {
        this.width = 4;
        this.height = 15;
        this.x = startX - this.width / 2;
        this.y = ship.y;
        this.speed = 15;
        this.active = true;
    }

    draw() {
        ctx.fillStyle = '#ff33aa'; 
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    update() {
        this.y -= this.speed;
        if (this.y < -this.height) {
            this.active = false;
        }
    }
}

// --- CLASE ASTEROID (VERSIÓN SIMPLE CON VELOCIDAD BASE) ---
class Asteroid {
    constructor(size, x, y, dx, dy) { 
        this.size = size || (Math.random() < 0.5 ? 20 : 35); 
        this.x = x !== undefined ? x : Math.random() * (GAME_WIDTH - this.size);
        this.y = y !== undefined ? y : -this.size;
        this.radius = this.size / 2;
        this.color = '#cccccc';
        this.value = this.size === 35 ? 10 : 25; 
        
        const baseSpeed = 4 - (this.size / 15);
        
        this.dx = dx !== undefined ? dx : (Math.random() - 0.5) * 2; // Deriva horizontal base
        this.dy = dy !== undefined ? dy : (Math.random() * 0.5 + 1.5); // Movimiento de caída asegurado
        
        this.active = true;
    }

    draw() {
        const centerX = this.x + this.radius;
        const centerY = this.y + this.radius;
        
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    update() {
        // Aplicar multiplicador de velocidad global
        this.y += this.dy * baseAsteroidSpeed; 
        this.x += this.dx * baseAsteroidSpeed; // Deriva normal

        // --- LÓGICA DE BORDES SIMPLE ---
        if (this.x + this.size < 0) this.x = GAME_WIDTH;
        if (this.x > GAME_WIDTH) this.x = 0 - this.size;
        
        if (this.y > GAME_HEIGHT) {
            this.active = false;
        }
    }

    split() {
        if (this.size > 20) {
            const newSize = this.size / 2;
            
            // Los asteroides divididos heredan la deriva
            const a1 = new Asteroid(newSize, this.x, this.y, (this.dx || 1) + 2, this.dy);
            const a2 = new Asteroid(newSize, this.x + newSize, this.y, (this.dx || -1) - 2, this.dy);
            
            return [a1, a2];
        }
        return [];
    }
}

// --- Arreglos de Objetos del Juego ---
let ship;
let lasers = [];
let asteroids = [];

// --- Funciones Centrales ---

function resetGame() {
    ship = new Ship();
    lasers = [];
    asteroids = [];
    score = 0;
    lives = 3;
    
    // --- REINICIAR DIFICULTAD ---
    timeSinceLastAsteroid = BASE_SPAWN_INTERVAL; 
    currentSpawnInterval = BASE_SPAWN_INTERVAL;
    currentScoreDifficultyLevel = 0;
    baseAsteroidSpeed = 1.0;
    
    updateHUD();
    startTime = performance.now(); 
    zenLevel = 1; 
    
    // --- ACTIVAR FUEGO AUTOMÁTICO ---
    keys.space = true;
    targetShipX = GAME_WIDTH / 2; // Centrar el objetivo
}

// FORMATO LARGO (para < 1 min)
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const minText = minutes === 1 ? 'minuto' : 'minutos';
    const secText = seconds === 1 ? 'segundo' : 'segundos';
    
    if (minutes > 0) {
        return `${minutes} ${minText} y ${seconds} ${secText}`;
    } else {
        return `${seconds} ${secText}`;
    }
}

// --- NUEVO: FORMATO M:SS (para >= 1 min) ---
function formatTimeMinimal(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    // Añadir un cero '0' si los segundos son < 10
    const paddedSeconds = seconds < 10 ? '0' + seconds : seconds;
    return `${minutes}:${paddedSeconds}`;
}


// --- FUNCIÓN DE UI ACTUALIZADA (CORAZONES) ---
function updateHUD() {
    scoreDisplay.textContent = score;
    
    livesDisplay.innerHTML = ''; // Limpiar corazones anteriores
    for (let i = 0; i < lives; i++) {
        const heart = document.createElement('span');
        heart.innerHTML = '♥'; // Usar el carácter de corazón
        livesDisplay.appendChild(heart);
    }
}

// --- CHEQUEO DE COLISIÓN (RECT vs CIRCLE) ---
function checkCollision(obj1, obj2) {
    // obj1 = rect (ship, laser), obj2 = circle (asteroid)
    const astCenterX = obj2.x + obj2.radius;
    const astCenterY = obj2.y + obj2.radius;

    let closeX = Math.max(obj1.x, Math.min(astCenterX, obj1.x + obj1.width));
    let closeY = Math.max(obj1.y, Math.min(astCenterY, obj1.y + obj1.height));

    const distX = astCenterX - closeX;
    const distY = astCenterY - closeY;
    
    const distanceSquared = (distX * distX) + (distY * distY);
    
    return distanceSquared < (obj2.radius * obj2.radius);
}

// --- PROCESO DE COLISIÓN (SIMPLE + DIFICULTAD POR PUNTUACIÓN) ---
function processCollisions() {
    
    // 1. Chequear Láser vs. Asteroide (Puntuación y Dificultad)
    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        if (!laser.active) continue; 
        
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const asteroid = asteroids[j];
            
            if (asteroid.active && checkCollision(laser, asteroid)) {
                laser.active = false;
                asteroid.active = false; // Destrucción instantánea
                score += asteroid.value;

                // --- NUEVO: Chequeo de Dificultad por Puntuación ---
                if (score > (currentScoreDifficultyLevel + 1) * SCORE_DIFFICULTY_THRESHOLD) {
                    currentScoreDifficultyLevel++;
                    // Incrementar dificultad (10% más rápido aparición, 5% más rápido velocidad)
                    currentSpawnInterval *= 0.9; 
                    baseAsteroidSpeed += 0.05; 
                    
                    if (currentSpawnInterval < MIN_SPAWN_INTERVAL) {
                        currentSpawnInterval = MIN_SPAWN_INTERVAL;
                    }
                }

                const newAsteroids = asteroid.split(); // Dividir si es grande
                asteroids.push(...newAsteroids);
                
                break; 
            }
        }
    }

    // 2. Chequear Nave vs. Asteroide (Pérdida de Vida)
    if (lives > 0) {
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const asteroid = asteroids[j];
            if (asteroid.active && checkCollision(ship, asteroid)) {
                lives--;
                asteroid.active = false;
                
                ship.x = GAME_WIDTH / 2 - ship.width / 2; 
                targetShipX = GAME_WIDTH / 2;
                
                if (lives <= 0) {
                    gameOver();
                    break;
                }
            }
        }
    }

    // 3. Limpiar arreglos
    lasers = lasers.filter(l => l.active);
    asteroids = asteroids.filter(a => a.active);
}

// --- FUNCIÓN DE APARICIÓN (SIMPLE) ---
function spawnAsteroid(deltaTime) {
    // Lógica de Asteroides
    timeSinceLastAsteroid += deltaTime;
    if (timeSinceLastAsteroid > currentSpawnInterval) {
        asteroids.push(new Asteroid()); 
        timeSinceLastAsteroid = 0;
    }
}

// --- FUNCIÓN GAMEOVER CON LÓGICA DE MENSAJE ACTUALIZADA ---
function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationFrameId);
    stopBreathing(); 
    gameContainer.style.cursor = 'default'; // Restablecer cursor
    
    // La música sigue sonando, NO la detenemos
    
    endTime = performance.now();
    const totalZenTime = endTime - startTime;
    const totalMinutes = Math.floor(totalZenTime / 60000);
    
    let contentHTML = ""; // Variable para el contenido del modal

    // --- Lógica de Mensajes Zen (Dividida) ---
    if (totalMinutes <= 0) {
        // --- MENSAJE PARA MENOS DE 1 MINUTO ---
        const formattedZenTime = formatTime(totalZenTime); // Usa el formato largo ("XX segundos")
        
        contentHTML = `
            <!-- 1. Puntuación -->
            <p class="final-score" style="margin-bottom: 35px; margin-top: 0;">
                <span style="color: #ffcc00; font-size: 3em; text-shadow: 0 0 10px #ffcc00;">${score}</span>
            </p>
            
            <!-- 2. Mensaje de Segundos + Motivación -->
            <p class="zen-motivation" style="margin-top: 0; font-size: clamp(1.1rem, 4vw, 1.3rem);">
                ${formattedZenTime}<br><strong>¡Vos podés respirar más!</strong>
            </p>
            
            <!-- 3. Botón de Reinicio -->
            <button id="start-button" style="margin-top: 35px;">Reiniciar Juego</button>
        `;
    
    } else {
        // --- MENSAJE PARA 1 MINUTO O MÁS ---
        const zenMessages = [
            "disminuir la frecuencia cardíaca.", // Min 1 (índice 0)
            "regular tu sistema nervioso.", // Min 2 (índice 1)
            "optimizar la oxigenación cerebral.", // Min 3 (índice 2)
            "estabilizar tu patrón respiratorio.", // Min 4 (índice 3)
            "iniciar la reducción de cortisol.", // Min 5 (índice 4)
            "sostener la activación parasimpática.", // Min 6 (índice 5)
            "alcanzar la coherencia cardíaca.", // Min 7 (índice 6)
            "equilibrar tu homeostasis autonómica.", // Min 8 (índice 7)
            "inducir un estado alfa de actividad cortical.", // Min 9 (índice 8)
            "alcanzar la estabilidad fisiológica óptima." // Min 10+ (índice 9)
        ];
        
        let zenAchievement = "";
        if (totalMinutes >= 10) {
            zenAchievement = zenMessages[9]; // Mensaje de 10 minutos o más
        } else {
            zenAchievement = zenMessages[totalMinutes - 1]; // Mensajes para minutos 1-9
        }
        
        // --- NUEVO FORMATO DE MENSAJE (M:SS) ---
        const minimalTime = formatTimeMinimal(totalZenTime); // Llama al nuevo formato "M:SS"
        let fullMessage = `<strong>${minimalTime}</strong> y ya empezaste a ${zenAchievement}`;

        contentHTML = `
            <!-- 1. Puntuación -->
            <p class="final-score" style="margin-bottom: 35px; margin-top: 0;">
                <span style="color: #ffcc00; font-size: 3em; text-shadow: 0 0 10px #ffcc00;">${score}</span>
            </p>
            
            <!-- 2. Mensaje de Logro Zen (Actualizado) -->
            <p class="zen-feedback" style="margin-top: 0; font-size: clamp(1.1rem, 4vw, 1.3rem);">
                ${fullMessage}
            </p>
            
            <!-- 3. Botón de Reinicio -->
            <button id="start-button" style="margin-top: 35px;">Reiniciar Juego</button>
        `;
    }
    
    messageBox.innerHTML = contentHTML;
    
    // CRÍTICO: Reasignar el listener al botón RECIÉN CREADO para reiniciar el juego
    document.getElementById('start-button').addEventListener('click', handleStartGame);
    
    messageBox.classList.add('visible');
}

// --- Bucle del Juego (SIMPLE) ---
function gameLoop(timestamp) {
    if (!gameRunning) return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    // 1. Limpiar el canvas (transparente)
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 2. Actualizar y Dibujar (Orden de dibujado es importante)
    ship.update(deltaTime);
    ship.draw();
    
    lasers.forEach(l => l.update());
    lasers.forEach(l => l.draw());
    
    asteroids.forEach(a => a.update());
    asteroids.forEach(a => a.draw());

    // 3. Generar, Colisionar y Actualizar HUD
    spawnAsteroid(deltaTime);
    processCollisions();
    updateHUD();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// Función única para manejar el inicio/reinicio del juego
function handleStartGame() {
    if (gameRunning || tutorialActive) return; 

    // Reconstruir el mensaje inicial si no existe ya
    if (!document.querySelector('#message-box h2') || document.querySelector('#message-box h2').textContent !== 'Tirador Cósmico') {
        messageBox.innerHTML = `
            <h2>Tirador Cósmico</h2>
            <p class="zen-benefit">
                Este juego es un ejercicio de respiración diseñado para calmar tu sistema nervioso. Sigue el ritmo y relaja tu mente.
            </p>
            <button id="start-button">Iniciar Juego</button>
        `;
        // Asegurar que el listener está en el nuevo botón
        document.getElementById('start-button').addEventListener('click', handleStartGame);
    }

    if (backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {});
    }

    messageBox.classList.remove('visible');

    // Verificar si es la primera vez
    const haVistoTutorial = localStorage.getItem('haVistoElTutorial');
    
    if (haVistoTutorial === 'true') {
        // Ya vio el tutorial, iniciar juego directamente
        startActualGame();
    } else {
        // Primera vez, mostrar tutorial
        startTutorial();
    }
}

// Inicializar el listener del botón de inicio original
document.getElementById('start-button').addEventListener('click', handleStartGame);

// Configuración inicial
resetGame();
gameRunning = false;
