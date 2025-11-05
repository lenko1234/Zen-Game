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

// POWER-UP DE LÁSER LARGO
let tripleShotActive = false;
let tripleShotEndTime = 0;
let numShots = 1; // Cantidad de disparos (empieza en 1)
let powerUpsCollected = 0; // Contador de power-ups recogidos

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
        // Establecer escala objetivo para crecer
        if (ship) ship.targetScale = 1.3;
    } else if (phaseName === 'SOSTENER') {
        gameContainer.classList.add('breathing-hold1');
        // Mantener grande
        if (ship) ship.targetScale = 1.3;
    } else if (phaseName === 'EXHALAR') {
        gameContainer.classList.add('breathing-exhale');
        // Establecer escala objetivo para reducir
        if (ship) ship.targetScale = 1.0;
    } else if (phaseName === 'PAUSAR') {
        gameContainer.classList.add('breathing-hold2');
        // Mantener pequeño
        if (ship) ship.targetScale = 1.0;
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

// --- LÓGICA DE RACHA DIARIA (LOCALSTORAGE) ---

/**
 * Obtiene una fecha en formato YYYY-MM-DD
 * @param {Date} date - El objeto de fecha a formatear
 * @returns {string} - La fecha como 'YYYY-MM-DD'
 */
function getFormattedDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // Meses son 0-indexados
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Revisa y actualiza la racha diaria del jugador.
 * Se llama solo UNA VEZ al iniciar el juego.
 * @returns {number} - El número de racha actual.
 */
function updateDailyStreak() {
    const today = new Date();
    const todayStr = getFormattedDate(today);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getFormattedDate(yesterday);

    // 1. Obtener datos guardados
    const lastPlayDate = localStorage.getItem('lastPlayDate');
    let streakCount = parseInt(localStorage.getItem('zenStreakCount')) || 0;

    // 2. Decidir la lógica
    if (lastPlayDate === todayStr) {
        // Ya jugó hoy. No hacer nada. Devolver la racha actual.
        return streakCount;
    }

    if (lastPlayDate === yesterdayStr) {
        // ¡La racha continúa!
        streakCount++;
    } else {
        // Se rompió la racha (o es el primer día)
        streakCount = 1;
    }

    // 3. Guardar los nuevos datos
    localStorage.setItem('lastPlayDate', todayStr);
    localStorage.setItem('zenStreakCount', streakCount);

    return streakCount;
}

// --- Fin de la Lógica de Racha ---

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
        // Establecer escala objetivo para crecer
        if (ship) ship.targetScale = 1.3;
    } else if (phaseName === 'SOSTENER') {
        gameContainer.classList.add('breathing-hold1');
        // Mantener grande
        if (ship) ship.targetScale = 1.3;
    } else if (phaseName === 'EXHALAR') {
        gameContainer.classList.add('breathing-exhale');
        // Establecer escala objetivo para reducir
        if (ship) ship.targetScale = 1.0;
    } else if (phaseName === 'PAUSAR') {
        gameContainer.classList.add('breathing-hold2');
        // Mantener pequeño
        if (ship) ship.targetScale = 1.0;
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
        this.baseWidth = 40;
        this.baseHeight = 30;
        this.width = this.baseWidth;
        this.height = this.baseHeight;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - this.height - 50; 
        this.speed = 8; // Velocidad para el teclado (de repuesto)
        this.laserCooldown = 200; // ms
        this.lastShotTime = 0;
        this.targetScale = 1.0; // Escala objetivo
        this.currentScale = 1.0; // Escala actual
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
        // Animar escala gradualmente - toma 5 segundos para cambiar de 1.0 a 1.5
        // Diferencia de escala: 0.5, debe completarse en 5000ms
        // Velocidad = 0.5 / 5000ms = 0.0001 por ms
        const scaleSpeed = 0.0001 * deltaTime;
        
        if (this.currentScale < this.targetScale) {
            this.currentScale = Math.min(this.currentScale + scaleSpeed, this.targetScale);
        } else if (this.currentScale > this.targetScale) {
            this.currentScale = Math.max(this.currentScale - scaleSpeed, this.targetScale);
        }
        
        // Aplicar escala al tamaño
        this.width = this.baseWidth * this.currentScale;
        this.height = this.baseHeight * this.currentScale;
        
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
            
            // Verificar si el triple shot sigue activo
            if (tripleShotActive && now > tripleShotEndTime) {
                tripleShotActive = false;
                numShots = 1; // Volver a disparo normal
            }
            
            if (now - this.lastShotTime > this.laserCooldown) {
                if (numShots === 1) {
                    // Disparo normal (1 láser)
                    lasers.push(new Laser(this.x + this.width / 2, false));
                } else {
                    // Múltiples disparos distribuidos
                    const spacing = 15; // Separación entre láseres
                    const startOffset = -((numShots - 1) * spacing) / 2;
                    
                    for (let i = 0; i < numShots; i++) {
                        const offsetX = startOffset + (i * spacing);
                        lasers.push(new Laser(this.x + this.width / 2 + offsetX, false));
                    }
                }
                this.lastShotTime = now;
            }
        }
    }
}

class Laser {
    constructor(startX, isLong = false) {
        this.width = 4;
        this.height = isLong ? 50 : 15; // Láser largo tiene 50px de altura
        this.x = startX - this.width / 2;
        this.y = ship.y;
        this.speed = 15;
        this.active = true;
        this.isLong = isLong;
    }

    draw() {
        ctx.fillStyle = this.isLong ? '#00ffff' : '#ff33aa'; // Cyan para láser largo
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        if (this.isLong) {
            // Efecto brillante para láser largo
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 10;
        }
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
    constructor(size, x, y, dx, dy, isSpecial = false) { 
        this.size = size || (Math.random() < 0.5 ? 20 : 35); 
        this.x = x !== undefined ? x : Math.random() * (GAME_WIDTH - this.size);
        this.y = y !== undefined ? y : -this.size;
        this.radius = this.size / 2;
        this.isSpecial = isSpecial;
        
        if (isSpecial) {
            this.color = '#ffaa00'; // Naranja para asteroides especiales
            this.health = 3; // Requiere 3 disparos
            this.value = 50; // Más puntos
        } else {
            this.color = '#cccccc';
            this.value = this.size === 35 ? 10 : 25;
        }
        
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
        
        // Si es especial, dibujar borde brillante
        if (this.isSpecial) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
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
    
    hit() {
        if (this.isSpecial) {
            this.health--;
            if (this.health <= 0) {
                return true; // Destruido
            }
            return false; // Aún vivo
        }
        return true; // Asteroides normales se destruyen de un golpe
    }

    split() {
        if (this.size > 20 && !this.isSpecial) {
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
let powerUps = [];

// --- Funciones Centrales ---

function resetGame() {
    ship = new Ship();
    lasers = [];
    asteroids = [];
    powerUps = [];
    score = 0;
    lives = 3;
    
    // --- REINICIAR DIFICULTAD ---
    timeSinceLastAsteroid = BASE_SPAWN_INTERVAL; 
    currentSpawnInterval = BASE_SPAWN_INTERVAL;
    currentScoreDifficultyLevel = 0;
    baseAsteroidSpeed = 1.0;
    
    // --- REINICIAR POWER-UPS ---
    tripleShotActive = false;
    tripleShotEndTime = 0;
    numShots = 1;
    powerUpsCollected = 0;
    
    updateHUD();
    startTime = performance.now();
    endTime = 0; // Resetear endTime para el nuevo juego
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

// Colisión rectángulo-rectángulo (para power-ups)
function checkRectCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
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
                
                // Usar método hit() para asteroides especiales
                const destroyed = asteroid.hit();
                
                if (destroyed) {
                    asteroid.active = false;
                    score += asteroid.value;
                    
                    // Si era especial, crear power-up
                    if (asteroid.isSpecial) {
                        powerUps.push({
                            x: asteroid.x,
                            y: asteroid.y,
                            width: 30,
                            height: 30,
                            speed: 2,
                            active: true
                        });
                    }

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
                }
                
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
    
    // 3. Chequear Nave vs. Power-up (Activación)
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
        if (powerUp.active && checkRectCollision(ship, powerUp)) {
            powerUp.active = false;
            tripleShotActive = true;
            tripleShotEndTime = performance.now() + 10000; // Renovar 10 segundos
            numShots++; // Incrementar cantidad de disparos
            powerUpsCollected++; // Incrementar contador para reducir spawn
        }
    }

    // 4. Limpiar arreglos
    lasers = lasers.filter(l => l.active);
    asteroids = asteroids.filter(a => a.active);
    powerUps = powerUps.filter(p => p.active);
}

// --- FUNCIÓN DE APARICIÓN (SIMPLE) ---
function spawnAsteroid(deltaTime) {
    // Lógica de Asteroides
    timeSinceLastAsteroid += deltaTime;
    if (timeSinceLastAsteroid > currentSpawnInterval) {
        // Reducir probabilidad según power-ups recogidos
        // Empieza en 5%, reduce 1% por cada 2 power-ups (mínimo 0.5%)
        let spawnChance = 0.05 - (Math.floor(powerUpsCollected / 2) * 0.01);
        spawnChance = Math.max(spawnChance, 0.005); // Mínimo 0.5%
        
        const isSpecial = Math.random() < spawnChance;
        
        // Pasar undefined para size, x, y, dx, dy y luego isSpecial
        asteroids.push(new Asteroid(undefined, undefined, undefined, undefined, undefined, isSpecial)); 
        timeSinceLastAsteroid = 0;
    }
}

// --- FUNCIÓN GAMEOVER CON LÓGICA DE MENSAJE ACTUALIZADA ---
// --- FUNCIÓN PARA MOSTRAR ESTADÍSTICAS ---
function showStats() {
    const currentStreak = parseInt(localStorage.getItem('zenStreakCount')) || 0;
    
    // Mensajes de beneficios según la racha (días 1-30+)
    const benefitMessages = {
        1: "Has dado el primer paso hacia el bienestar mental. En unos días la respiración consciente va a activar tu sistema nervioso parasimpático.",
        2: "Con tu práctica, puedes notar pequeñas mejoras en tu concentración y una sensación ligera de calma. Esto es el primer efecto del sistema nervioso parasimpático activándose.",
        3: "Si continúas practicando, tu cuerpo comienza a acostumbrarse a la respiración controlada, ayudando a reducir respuestas inmediatas de estrés.",
        4: "La respiración regular empieza a influir en tu frecuencia cardíaca y en tu ritmo respiratorio, aunque de forma sutil.",
        5: "Tu mente puede sentirse un poco más clara y enfocada. La práctica constante empieza a entrenar tu capacidad de atención.",
        6: "Al seguir respirando conscientemente, tu cuerpo aprende a relajarse más rápido ante pequeñas tensiones o molestias.",
        7: "Una semana de práctica ayuda a notar un patrón de calma más consistente. Es el comienzo de una regulación más estable del sistema nervioso.",
        8: "Puedes sentir que los momentos de estrés se vuelven ligeramente más fáciles de manejar gracias a la respiración controlada.",
        9: "Tu mente empieza a asociar la respiración profunda con una sensación de relajación, formando un hábito saludable.",
        10: "Diez días de práctica diaria permiten notar una ligera reducción en la sensación general de ansiedad y tensión.",
        11: "Los efectos de la respiración consciente se hacen más evidentes en tu concentración y claridad mental.",
        12: "Tu cuerpo responde de forma más estable a situaciones de estrés. La respiración pausada facilita la calma inmediata.",
        13: "La práctica constante empieza a mejorar la percepción de bienestar, incluso en momentos tranquilos del día.",
        14: "Dos semanas de respiración consciente refuerzan la activación parasimpática y tu capacidad de relajarte bajo presión.",
        15: "Puedes notar que los pensamientos acelerados disminuyen más rápido cuando respiras conscientemente.",
        16: "El cuerpo y la mente empiezan a sincronizarse con la respiración profunda, mejorando la regulación emocional.",
        17: "La práctica diaria ayuda a que tu respuesta al estrés sea más calmada y controlada.",
        18: "Puedes sentir un aumento en la claridad mental y en la capacidad de concentración sostenida.",
        19: "La respiración consciente empieza a consolidar un patrón de relajación que se mantiene más tiempo entre sesiones.",
        20: "Veinte días de práctica diaria permiten notar beneficios más consistentes en la gestión de ansiedad y estrés.",
        21: "Tu mente y cuerpo comienzan a responder más rápido a la respiración como herramienta de calma y enfoque.",
        22: "La regulación de la frecuencia cardíaca y respiratoria se vuelve más estable, incluso fuera de la sesión de respiración.",
        23: "Se empieza a formar una memoria corporal de la respiración consciente, facilitando la relajación automática.",
        24: "La práctica constante fortalece la conexión entre respiración, calma y concentración mental.",
        25: "Puedes notar que los momentos de estrés diario se perciben menos intensos y más manejables.",
        26: "Tu mente está más entrenada para responder con calma, gracias a la repetición y consistencia de la práctica.",
        27: "La respiración consciente empieza a integrarse naturalmente en tu día a día, sin esfuerzo consciente.",
        28: "Veintiocho días de práctica ayudan a consolidar beneficios de regulación emocional, calma y concentración sostenida.",
        29: "La práctica diaria fortalece la resiliencia mental y la capacidad de mantener la atención bajo presión.",
        30: "Tras un mes de respiración consciente, tu cuerpo y mente están más acostumbrados a la calma, y tu capacidad de manejar estrés y mantener concentración se ha reforzado."
    };
    
    // Obtener el mensaje correspondiente al día, o uno genérico si supera 30 días
    let benefitMessage = benefitMessages[currentStreak] || "Maestría en desarrollo. Has alcanzado un nivel de práctica que optimiza la oxigenación cerebral y la homeostasis autonómica de forma sostenida.";
    
    messageBox.innerHTML = `
        <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: url('assets/tree-background.jpeg');
            background-size: cover;
            background-position: center;
            filter: brightness(0.4);
            z-index: -1;
        "></div>
        
        <p style="color: #ff9900; font-size: 2.5rem; margin: 20px 0; text-shadow: 0 0 10px #ff9900; position: relative; z-index: 1;">
            🔥 ${currentStreak}
        </p>
        <p style="color: #00ffaa; font-size: 1.2rem; margin-bottom: 25px; position: relative; z-index: 1;">
            ${currentStreak === 1 ? 'día consecutivo' : 'días consecutivos'}
        </p>
        
        <p style="font-size: 1.1rem; line-height: 1.6; margin: 20px 0; color: #e0e0e0; position: relative; z-index: 1;">
            ${benefitMessage}
        </p>
        
        <button id="back-button" style="margin-top: 25px; position: relative; z-index: 1;">Volver</button>
    `;
    
    document.getElementById('back-button').addEventListener('click', gameOver);
}

function gameOver() {
    // Solo detener el juego si está corriendo
    if (gameRunning) {
        gameRunning = false;
        cancelAnimationFrame(animationFrameId);
        stopBreathing(); 
        gameContainer.style.cursor = 'default'; // Restablecer cursor
        
        // Guardar el tiempo una sola vez cuando termina el juego
        endTime = performance.now();
    }
    
    // La música sigue sonando, NO la detenemos
    
    const totalZenTime = endTime - startTime;
    const totalMinutes = Math.floor(totalZenTime / 60000);
    
    // Obtener la racha actual
    const currentStreak = parseInt(localStorage.getItem('zenStreakCount')) || 0;
    
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
            
            <!-- 2. Tiempo -->
            <p style="margin-top: 0; margin-bottom: 10px; font-size: clamp(1.1rem, 4vw, 1.3rem); color: #00ffaa;">
                ${formattedZenTime}
            </p>
            
            <!-- 3. Mensaje de Motivación -->
            <p class="zen-motivation" style="margin-top: 0; margin-bottom: 25px; font-size: clamp(1.1rem, 4vw, 1.3rem);">
                <strong>¡Vos podés respirar más!</strong>
            </p>
            
            <!-- 4. Botones -->
            <button id="stats-button" style="margin-top: 25px; background: #00ffaa; color: #000;">Ver Estadísticas</button>
            <button id="start-button" style="margin-top: 10px;">Reiniciar Juego</button>
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

        contentHTML = `
            <!-- 1. Puntuación -->
            <p class="final-score" style="margin-bottom: 35px; margin-top: 0;">
                <span style="color: #ffcc00; font-size: 3em; text-shadow: 0 0 10px #ffcc00;">${score}</span>
            </p>
            
            <!-- 2. Tiempo -->
            <p style="margin-top: 0; margin-bottom: 10px; font-size: clamp(1.1rem, 4vw, 1.3rem); color: #00ffaa;">
                ${minimalTime}
            </p>
            
            <!-- 3. Mensaje de Logro Zen -->
            <p class="zen-feedback" style="margin-top: 0; margin-bottom: 25px; font-size: clamp(1.1rem, 4vw, 1.3rem);">
                Empezaste a ${zenAchievement}
            </p>
            
            <!-- 4. Botones -->
            <button id="stats-button" style="margin-top: 25px; background: #00ffaa; color: #000;">Ver Estadísticas</button>
            <button id="start-button" style="margin-top: 10px;">Reiniciar Juego</button>
        `;
    }
    
    messageBox.innerHTML = contentHTML;
    
    // CRÍTICO: Reasignar los listeners a los botones RECIÉN CREADOS
    document.getElementById('start-button').addEventListener('click', handleStartGame);
    document.getElementById('stats-button').addEventListener('click', showStats);
    
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
    
    // Power-ups
    powerUps.forEach(p => {
        p.y += p.speed;
        if (p.y > GAME_HEIGHT) p.active = false;
    });
    powerUps.forEach(p => {
        if (p.active) {
            ctx.fillStyle = '#00ff00';
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 15;
            ctx.fillRect(p.x, p.y, p.width, p.height);
            ctx.shadowBlur = 0;
        }
    });

    // 3. Generar, Colisionar y Actualizar HUD
    spawnAsteroid(deltaTime);
    processCollisions();
    updateHUD();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// Función única para manejar el inicio/reinicio del juego
function handleStartGame() {
    if (gameRunning || tutorialActive) return; 

    // Actualizar la racha diaria (sin mostrarla aquí)
    updateDailyStreak();

    // Reconstruir mensaje de inicio
    messageBox.innerHTML = `
        <h2>Tirador Cósmico</h2>
        
        <p class="zen-benefit">
            Este juego es un ejercicio de respiración diseñado para calmar tu sistema nervioso. Sigue el ritmo y relaja tu mente.
        </p>
        <button id="start-button">Iniciar Juego</button>
    `;
    // Asegurar que el listener está en el nuevo botón
    document.getElementById('start-button').addEventListener('click', handleStartGame);

    if (backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {});
    }

    messageBox.classList.remove('visible');

    // Verificar si debe mostrar el tutorial (primeros 3 días)
    const currentStreak = parseInt(localStorage.getItem('zenStreakCount')) || 0;
    const haVistoTutorial = localStorage.getItem('haVistoElTutorial');
    
    if (currentStreak <= 3 && haVistoTutorial !== 'true') {
        // Primeros 3 días, mostrar tutorial
        startTutorial();
    } else {
        // Día 4 en adelante, iniciar juego directamente
        localStorage.setItem('haVistoElTutorial', 'true');
        startActualGame();
    }
}

// Inicializar el listener del botón de inicio original
document.getElementById('start-button').addEventListener('click', handleStartGame);
document.getElementById('benefits-button').addEventListener('click', showBenefitsMenu);

// Función para mostrar el menú de beneficios
function showBenefitsMenu() {
    messageBox.innerHTML = `
        <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: url('assets/tree-background.jpeg');
            background-size: cover;
            background-position: center;
            filter: brightness(0.4);
            z-index: -1;
        "></div>
        
        <h2 style="color: #00ffaa; margin-bottom: 30px; position: relative; z-index: 1; text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">Beneficios de Box Breathing</h2>
        
        <button id="immediate-btn" style="margin: 10px 0; width: 90%; max-width: 400px; padding: 15px; font-size: 1rem; position: relative; z-index: 1;">
            🕐 Efectos inmediatos (1 a 5 minutos)
        </button>
        
        <button id="short-term-btn" style="margin: 10px 0; width: 90%; max-width: 400px; padding: 15px; font-size: 1rem; position: relative; z-index: 1;">
            🕒 Efectos a corto plazo (unos días de práctica diaria)
        </button>
        
        <button id="long-term-btn" style="margin: 10px 0; width: 90%; max-width: 400px; padding: 15px; font-size: 1rem; position: relative; z-index: 1;">
            🕓 Efectos a largo plazo (2–4 semanas de práctica constante)
        </button>
        
        <button id="back-to-menu-btn" style="margin-top: 25px; background: rgba(255, 255, 255, 0.1); position: relative; z-index: 1;">Volver</button>
    `;
    
    messageBox.classList.add('visible');
    
    // Event listeners para cada botón
    document.getElementById('immediate-btn').addEventListener('click', () => {
        messageBox.innerHTML = `
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-image: url('assets/tree-background.jpeg');
                background-size: cover;
                background-position: center;
                filter: brightness(0.4);
                z-index: -1;
            "></div>
            
            <div style="text-align: left; max-width: 500px; margin: 0 auto; position: relative; z-index: 1; line-height: 1.6;">
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Disminuye la frecuencia cardíaca y la tensión muscular.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Se activa el nervio vago, lo que reduce la respuesta de "lucha o huida".</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Sentís una calma física y mental parecida a después de meditar unos minutos.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Aumenta ligeramente la claridad mental y la capacidad de concentración.</p>
                <p style="margin-top: 20px; font-style: italic; color: #00ffaa; font-size: 0.9rem; text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">
                    (Esto ocurre porque el patrón regular de respiración estabiliza el nivel de CO₂ en sangre y regula la excitabilidad del sistema nervioso autónomo.)
                </p>
            </div>
            
            <button id="back-benefits-btn" style="margin-top: 25px; position: relative; z-index: 1;">Volver</button>
        `;
        document.getElementById('back-benefits-btn').addEventListener('click', showBenefitsMenu);
    });
    
    document.getElementById('short-term-btn').addEventListener('click', () => {
        messageBox.innerHTML = `
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-image: url('assets/tree-background.jpeg');
                background-size: cover;
                background-position: center;
                filter: brightness(0.4);
                z-index: -1;
            "></div>
            
            <div style="text-align: left; max-width: 500px; margin: 0 auto; position: relative; z-index: 1; line-height: 1.6;">
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Menor reactividad ante el estrés cotidiano.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Sueño más estable.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Mejora del foco en tareas cognitivas o entrenamientos.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• El cuerpo empieza a reconocer la técnica como una señal de calma.</p>
            </div>
            
            <button id="back-benefits-btn" style="margin-top: 25px; position: relative; z-index: 1;">Volver</button>
        `;
        document.getElementById('back-benefits-btn').addEventListener('click', showBenefitsMenu);
    });
    
    document.getElementById('long-term-btn').addEventListener('click', () => {
        messageBox.innerHTML = `
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-image: url('assets/tree-background.jpeg');
                background-size: cover;
                background-position: center;
                filter: brightness(0.4);
                z-index: -1;
            "></div>
            
            <div style="text-align: left; max-width: 500px; margin: 0 auto; position: relative; z-index: 1; line-height: 1.6;">
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Disminución sostenida del cortisol basal (hormona del estrés).</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Mejora del control emocional.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• Mayor tolerancia al estrés y recuperación fisiológica más rápida después de eventos intensos.</p>
                <p style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8);">• El cuerpo entra en modo de regulación automática más fácilmente.</p>
            </div>
            
            <button id="back-benefits-btn" style="margin-top: 25px; position: relative; z-index: 1;">Volver</button>
        `;
        document.getElementById('back-benefits-btn').addEventListener('click', showBenefitsMenu);
    });
    
    document.getElementById('back-to-menu-btn').addEventListener('click', () => {
        messageBox.classList.remove('visible');
        location.reload(); // Recargar para volver al menú inicial
    });
}

// Configuración inicial
resetGame();
gameRunning = false;
