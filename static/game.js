const socket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");

const menu = document.getElementById("menu");
const game = document.getElementById("game");

const boardElement = document.getElementById("board");
const roomCode = document.getElementById("roomCode");
const playerColor = document.getElementById("playerColor");
const statusElement = document.getElementById("status");
const message = document.getElementById("message");
const newGameBtn = document.getElementById("newGameBtn");

let room = null;
let myColor = null;
let selectedSquare = null;
let currentFen = null;
let gameOver = false;
let capturedByWhite = [];
let capturedByBlack = [];

// Overhaul enhancements
let lastMove = null; // { from, to }
let pendingMove = null; // { from, to } for promotion

const pieces = {
    "P": "♙",
    "N": "♘",
    "B": "♗",
    "R": "♖",
    "Q": "♕",
    "K": "♔",

    "p": "♟",
    "n": "♞",
    "b": "♝",
    "r": "♜",
    "q": "♛",
    "k": "♚"
};

// --- WEB AUDIO API SYNTHESIZER ---
const Sound = {
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playMove() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    },

    playCapture() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(750, now);
        osc1.frequency.exponentialRampToValueAtTime(380, now + 0.05);
        gain1.gain.setValueAtTime(0.10, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.06);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(140, now);
        osc2.frequency.exponentialRampToValueAtTime(70, now + 0.12);
        gain2.gain.setValueAtTime(0.16, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.12);
    },

    playCheck() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(540, now);
        osc1.frequency.setValueAtTime(600, now + 0.07);

        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(270, now);
        osc2.frequency.setValueAtTime(300, now + 0.07);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.22);
        osc2.stop(now + 0.22);
    },

    playEnding() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const chords = [329.63, 392.00, 523.25, 659.25]; // C major elements: E4, G4, C5, E5

        chords.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + idx * 0.08 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + idx * 0.08 + 0.5);
        });
    }
};

// --- DYNAMIC TURN STATE HANDLER ---
function updateTurnState(statusOverride) {
    if (gameOver) {
        document.body.setAttribute("data-turn-state", "game-over");
        return;
    }
    if (statusOverride === "check") {
        document.body.setAttribute("data-turn-state", "check");
        return;
    }
    
    const isMyTurn = currentFen && (
        (currentFen.split(" ")[1] === "w" && myColor === "white") ||
        (currentFen.split(" ")[1] === "b" && myColor === "black")
    );
    
    if (isMyTurn) {
        document.body.setAttribute("data-turn-state", "my-turn");
    } else {
        document.body.setAttribute("data-turn-state", "opponent-turn");
    }
}

// --- CLIPBOARD COPY Overhaul ---
function setupClipboardCopy() {
    const badge = document.getElementById("roomCodeBadge");
    const tooltip = document.getElementById("copyTooltip");
    
    if (!badge || !tooltip) return;
    
    badge.addEventListener("click", () => {
        const textToCopy = roomCode.textContent;
        if (!textToCopy) return;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            tooltip.textContent = "Copied!";
            tooltip.classList.add("visible");
            setTimeout(() => {
                tooltip.classList.remove("visible");
                setTimeout(() => {
                    tooltip.textContent = "Copy Code";
                }, 200);
            }, 1200);
        }).catch(err => {
            console.error("Failed to copy room code: ", err);
        });
    });
}

// --- CUSTOM PAWN PROMOTION Overhaul ---
function setupPromotionModal() {
    const modal = document.getElementById("promotionModal");
    const cancelBtn = document.getElementById("cancelPromoBtn");
    
    if (!modal) return;
    
    const promoButtons = modal.querySelectorAll(".promotion-btn");
    promoButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            if (!pendingMove) return;
            const choice = btn.getAttribute("data-piece");
            
            socket.emit("make_move", {
                room: room,
                move: pendingMove.from + pendingMove.to + choice
            });
            
            modal.classList.add("hidden");
            pendingMove = null;
            selectedSquare = null;
            drawBoard(currentFen);
        });
    });
    
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            modal.classList.add("hidden");
            pendingMove = null;
            selectedSquare = null;
            drawBoard(currentFen);
        });
    }
}

function showPromotionModal(from, to) {
    pendingMove = { from, to };
    const modal = document.getElementById("promotionModal");
    if (!modal) return;
    
    const promoButtons = modal.querySelectorAll(".promotion-btn");
    promoButtons.forEach(btn => {
        const pieceType = btn.getAttribute("data-piece");
        // Adapt pieces based on player's perspective
        const pieceChar = myColor === "white" ? pieceType.toUpperCase() : pieceType.toLowerCase();
        btn.textContent = pieces[pieceChar];
        btn.className = "promotion-btn " + (myColor === "white" ? "white-piece" : "black-piece");
    });
    
    modal.classList.remove("hidden");
}

function showGame() {
    menu.classList.add("hidden");
    game.classList.remove("hidden");

    roomCode.textContent = room;
    playerColor.textContent = myColor;
    game.setAttribute("data-color", myColor);
}

// Ensure Web Audio works on first click/tap
document.body.addEventListener("click", () => Sound.init(), { once: true });

createBtn.onclick = () => {
    Sound.init();
    socket.emit("create_game");
};

joinBtn.onclick = () => {
    Sound.init();
    const code = roomInput.value.trim();

    if (!code) {
        message.textContent = "Enter a room code.";
        return;
    }

    socket.emit("join_game", {
        room: code
    });
};

newGameBtn.onclick = () => {
    Sound.init();
    if (!room) return;

    socket.emit("new_game", {
        room: room
    });
};

socket.on("game_created", data => {
    room = data.room;
    myColor = data.color;
    currentFen = data.fen;

    gameOver = false;
    selectedSquare = null;
    lastMove = null;
    capturedByWhite = [];
    capturedByBlack = [];
    updateCapturedPieces();

    showGame();
    drawBoard(currentFen);
    updateTurnState();

    statusElement.textContent =
        "Share room code " + room + " with your friend.";
    
    Sound.playMove();
});

socket.on("game_joined", data => {
    room = data.room || roomInput.value.trim().toUpperCase();
    myColor = data.color;
    currentFen = data.fen;

    gameOver = false;
    selectedSquare = null;
    lastMove = null;
    capturedByWhite = [];
    capturedByBlack = [];
    updateCapturedPieces();

    showGame();
    drawBoard(currentFen);
    updateTurnState();

    statusElement.textContent = "Game started!";
    Sound.playMove();
});

socket.on("opponent_joined", data => {
    if (data.fen) {
        currentFen = data.fen;
        drawBoard(currentFen);
    }

    statusElement.textContent = "Opponent joined. Your turn!";
    updateTurnState();
    Sound.playMove();
});

socket.on("new_game_started", data => {
    currentFen = data.fen;

    gameOver = false;
    selectedSquare = null;
    lastMove = null;
    capturedByWhite = [];
    capturedByBlack = [];

    updateCapturedPieces();
    drawBoard(currentFen);
    updateTurnState();

    statusElement.textContent = "New game started!";
    Sound.playMove();
});

socket.on("move_made", data => {
    currentFen = data.fen;
    selectedSquare = null;

    if (data.move) {
        lastMove = {
            from: data.move.slice(0, 2),
            to: data.move.slice(2, 4)
        };
    }

    if (data.captured) {
        if (data.capturedBy === "white") {
            capturedByWhite.push(data.captured);
        } else {
            capturedByBlack.push(data.captured);
        }

        updateCapturedPieces();
    }

    drawBoard(currentFen);

    if (data.status === "checkmate") {
        gameOver = true;
        if (data.winner === "white") {
            statusElement.textContent = "♔ White wins by checkmate!";
        } else {
            statusElement.textContent = "♚ Black wins by checkmate!";
        }
        updateTurnState();
        Sound.playEnding();

    } else if (data.status === "stalemate") {
        gameOver = true;
        statusElement.textContent = "Draw — stalemate.";
        updateTurnState();
        Sound.playEnding();

    } else if (data.status === "draw") {
        gameOver = true;
        statusElement.textContent = "Draw — insufficient material.";
        updateTurnState();
        Sound.playEnding();

    } else if (data.status === "check") {
        statusElement.textContent = "Check!";
        updateTurnState("check");
        Sound.playCheck();

    } else {
        statusElement.textContent = "Move made.";
        updateTurnState();
        if (data.captured) {
            Sound.playCapture();
        } else {
            Sound.playMove();
        }
    }
});

socket.on("invalid_move", data => {
    statusElement.textContent = data.message;
});

socket.on("error_message", data => {
    message.textContent = data.message;
});

socket.on("opponent_left", () => {
    statusElement.textContent = "Your opponent left the game.";
    gameOver = true;
    updateTurnState();
    Sound.playEnding();
});

function updateCapturedPieces() {
    const whiteArea = document.getElementById("capturedByWhite");
    const blackArea = document.getElementById("capturedByBlack");

    whiteArea.innerHTML = "";
    blackArea.innerHTML = "";

    capturedByWhite.forEach(piece => {
        const span = document.createElement("span");
        span.textContent = pieces[piece];
        span.classList.add("black-piece");
        whiteArea.appendChild(span);
    });

    capturedByBlack.forEach(piece => {
        const span = document.createElement("span");
        span.textContent = pieces[piece];
        span.classList.add("white-piece");
        blackArea.appendChild(span);
    });
}

function drawBoard(fen) {
    boardElement.innerHTML = "";

    const boardPart = fen.split(" ")[0];
    const rows = boardPart.split("/");

    let squares = [];

    for (let row of rows) {
        for (let char of row) {
            if (!isNaN(char)) {
                for (let i = 0; i < Number(char); i++) {
                    squares.push(null);
                }
            } else {
                squares.push(char);
            }
        }
    }

    let displaySquares = squares;
    const perspective = myColor || "white";

    if (perspective === "black") {
        displaySquares = [...squares].reverse();
    }

    const isMyTurn = currentFen && (
        (currentFen.split(" ")[1] === "w" && myColor === "white") ||
        (currentFen.split(" ")[1] === "b" && myColor === "black")
    );

    displaySquares.forEach((piece, index) => {
        const square = document.createElement("div");
        const row = Math.floor(index / 8);
        const col = index % 8;

        square.classList.add("square");

        if ((row + col) % 2 === 0) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        const squareCoord = boardIndexToSquare(index);

        // Highlight selected square
        if (selectedSquare === index) {
            square.classList.add("selected");
        }

        // Highlight last-move squares
        if (lastMove && (squareCoord === lastMove.from || squareCoord === lastMove.to)) {
            square.classList.add("last-move");
        }

        // Render Chess Unicode piece
        if (piece) {
            const pieceSpan = document.createElement("span");
            pieceSpan.classList.add("piece-glyph");
            pieceSpan.textContent = pieces[piece];

            if ("PNBRQK".includes(piece)) {
                pieceSpan.classList.add("white-piece");
            } else {
                pieceSpan.classList.add("black-piece");
            }
            square.appendChild(pieceSpan);

            // Turn-based playable hover highlight
            const isMyPiece = (myColor === "white" && "PNBRQK".includes(piece)) ||
                              (myColor === "black" && "pnbrqk".includes(piece));
            if (isMyTurn && isMyPiece) {
                square.classList.add("my-piece");
            }
        }

        // Render Coordinates overlay (files A-H and ranks 1-8)
        if (col === 0) {
            const rankLabel = document.createElement("span");
            rankLabel.classList.add("coordinate", "rank");
            rankLabel.textContent = perspective === "black" ? (row + 1) : (8 - row);
            square.appendChild(rankLabel);
        }

        if (row === 7) {
            const fileLabel = document.createElement("span");
            fileLabel.classList.add("coordinate", "file");
            fileLabel.textContent = String.fromCharCode(97 + (perspective === "black" ? 7 - col : col));
            square.appendChild(fileLabel);
        }

        square.onclick = () => squareClicked(index, displaySquares);
        boardElement.appendChild(square);
    });
}

function squareClicked(index, board) {
    if (gameOver) {
        return;
    }

    const piece = board[index];

    if (selectedSquare === null) {
        if (!piece) return;

        const isWhitePiece = "PNBRQK".includes(piece);
        const isBlackPiece = "pnbrqk".includes(piece);

        if (
            (myColor === "white" && !isWhitePiece) ||
            (myColor === "black" && !isBlackPiece)
        ) {
            return;
        }

        selectedSquare = index;
        drawBoard(currentFen);
        return;
    }

    const from = boardIndexToSquare(selectedSquare);
    const to = boardIndexToSquare(index);

    // Find the piece on the selected square.
    const movingPiece = board[selectedSquare];

    // Check whether this is a pawn moving to the final rank.
    const isPawn = movingPiece === "P" || movingPiece === "p";
    const targetRank = to[1];

    let promotion = "";

    if (
        isPawn &&
        ((myColor === "white" && targetRank === "8") ||
         (myColor === "black" && targetRank === "1"))
    ) {
        showPromotionModal(from, to);
        return;
    }

    socket.emit("make_move", {
        room: room,
        move: from + to + promotion
    });

    selectedSquare = null;
}

function boardIndexToSquare(index) {
    let actualIndex = index;

    if (myColor === "black") {
        actualIndex = 63 - index;
    }

    const file = actualIndex % 8;
    const rank = 8 - Math.floor(actualIndex / 8);

    return String.fromCharCode(97 + file) + rank;
}

// Initialize components on run
function initApp() {
    setupClipboardCopy();
    setupPromotionModal();
}

initApp();
