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

function showGame() {
    menu.classList.add("hidden");
    game.classList.remove("hidden");

    roomCode.textContent = room;
    playerColor.textContent = myColor;
}

createBtn.onclick = () => {
    socket.emit("create_game");
};

joinBtn.onclick = () => {
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
    capturedByWhite = [];
    capturedByBlack = [];
    updateCapturedPieces();

    showGame();
    drawBoard(currentFen);

    statusElement.textContent =
        "Share room code " + room + " with your friend.";
});

socket.on("game_joined", data => {
    room = data.room || roomInput.value.trim().toUpperCase();
    myColor = data.color;
    currentFen = data.fen;

    gameOver = false;
    selectedSquare = null;
    capturedByWhite = [];
    capturedByBlack = [];
    updateCapturedPieces();

    showGame();
    drawBoard(currentFen);

    statusElement.textContent = "Game started!";
});

socket.on("opponent_joined", data => {
    if (data.fen) {
        currentFen = data.fen;
        drawBoard(currentFen);
    }

    statusElement.textContent = "Opponent joined. Your turn!";
});

socket.on("new_game_started", data => {
    currentFen = data.fen;

    gameOver = false;
    selectedSquare = null;
    capturedByWhite = [];
    capturedByBlack = [];

    updateCapturedPieces();
    drawBoard(currentFen);

    statusElement.textContent = "New game started!";
});

socket.on("move_made", data => {
    currentFen = data.fen;
    selectedSquare = null;

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

    } else if (data.status === "stalemate") {

        gameOver = true;
        statusElement.textContent = "Draw — stalemate.";

    } else if (data.status === "draw") {

        gameOver = true;
        statusElement.textContent = "Draw — insufficient material.";

    } else if (data.status === "check") {

        statusElement.textContent = "Check!";

    } else {

        statusElement.textContent = "Move made.";
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

    if (myColor === "black") {
        displaySquares = [...squares].reverse();
    }

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

        if (piece) {

            square.textContent = pieces[piece];

            if ("PNBRQK".includes(piece)) {
                square.classList.add("white-piece");
            } else {
                square.classList.add("black-piece");
            }
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

        const squares = boardElement.children;

        if (squares[index]) {
            squares[index].classList.add("selected");
        }

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

        let choice = prompt(
            "Pawn promotion!\n\n" +
            "Enter:\n" +
            "Q = Queen\n" +
            "R = Rook\n" +
            "B = Bishop\n" +
            "N = Knight",
            "Q"
        );

        if (!choice) {
            selectedSquare = null;
            drawBoard(currentFen);
            return;
        }

        choice = choice.toLowerCase();

        if (!["q", "r", "b", "n"].includes(choice)) {
            alert("Invalid promotion. Choose Q, R, B or N.");
            selectedSquare = null;
            drawBoard(currentFen);
            return;
        }

        promotion = choice;
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
