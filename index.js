import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import session from "express-session";
import env from "dotenv";


const app = express();
const port = 3000;
const TOTAL_MOVIES = 20; // Define a constant for total movies
env.config();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 15
    }
}))

app.use((req, res, next) => {
    if (!req.session.gameData) {
        req.session.gameData = {
            gameArray: [],
            movieCount: 0,
            correctAnsCount: 0,
            wrongAnsCount: 0,
            skipLevelCount: 0
        };
    }
    next();
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Shuffle the game array using Fisher-Yates algorithm
function shuffleGameArray(gameArray) {
    for (let i = gameArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameArray[i], gameArray[j]] = [gameArray[j], gameArray[i]];
    }
}

// Start the game
app.post("/startGame", async (req, res) => {

    // Set the session flag to indicate a game has started
    req.session.gameInProgress = true;

    const startYear = req.body.fromYear;
    const endYear = req.body.toYear;
    let apiParams = {
        lang: "",
        startYear: startYear !== "any" ? `${startYear}-01-01` : "",
        endYear: endYear !== "any" ? `${endYear}-12-31` : "",
        noOfFrame: 0,
    };

    const industry = req.body.industry;
    const requests = [];

    // Prepare API requests based on selected industry
    if (industry === "any" || industry === "both") {
        const hindiApiParams = { ...apiParams, lang: "hi", noOfFrame: 10 };
        const englishApiParams = { ...apiParams, lang: "en", noOfFrame: 10 };
        requests.push(axios.get("https://guesstheframeapiserver.onrender.com/anyNumberOfMovieFrame", { params: hindiApiParams }));
        requests.push(axios.get("https://guesstheframeapiserver.onrender.com/anyNumberOfMovieFrame", { params: englishApiParams }));
    } else {
        apiParams.noOfFrame = 20;
        apiParams.lang = industry === "bollywood" ? "hi" : "en";
        requests.push(axios.get("https://guesstheframeapiserver.onrender.com/anyNumberOfMovieFrame", { params: apiParams }));
    }

    // Execute requests in parallel
    try {
        const responses = await Promise.all(requests);
        req.session.gameData.gameArray = responses.flatMap(response => response.data); // Combine all responses
        shuffleGameArray(req.session.gameData.gameArray); // Shuffle the game array
        console.log("Successfully created Game Array");
        req.session.gameData.movieCount = 0; // Reset movieCount at the start of a new game
        res.render("startGame.ejs", { link: req.session.gameData.gameArray[req.session.gameData.movieCount].path });
        // movieCount++;
    } catch (error) {
        console.error('Error fetching movie frames:', error);
        res.status(500).send("Failed to fetch movie frames.");
    }
});

// Move to the next movie frame
app.post("/skip", async (req, res) => {
    req.session.gameData.movieCount++;
    req.session.gameData.skipLevelCount++;
    console.log(req.session.gameData.movieCount,"User Skipped this level");
    if (req.session.gameData.movieCount === TOTAL_MOVIES - 1) {
        return res.render("startGame.ejs", { link: req.session.gameData.gameArray[req.session.gameData.movieCount].path, lastGame: true });
    }
    res.render("startGame.ejs", { link: req.session.gameData.gameArray[req.session.gameData.movieCount].path });
});

// Submit the user's answer
app.post("/submit", async (req, res) => {
    req.session.gameData.movieCount++;
    try {
        const userAnswer = req.body.userInput;
        console.log(userAnswer);
        const correctAnswer = req.session.gameData.gameArray[req.session.gameData.movieCount - 1].title;
        //check answer
        const response = await axios.get("https://guesstheframeapiserver.onrender.com/checkAnswer", { params : {
            correctAns : correctAnswer,
            userAns : userAnswer,
        },});
        if (response.data.userGetMark){
            req.session.gameData.correctAnsCount++;
            console.log(req.session.gameData.movieCount,"Correct Answer");
        }else{
            req.session.gameData.wrongAnsCount++;
            console.log(req.session.gameData.movieCount,"Incorrect Answer, correct title is : ", correctAnswer);
        }
        
        if (req.session.gameData.movieCount === TOTAL_MOVIES - 1) {
            return res.render("startGame.ejs", { link: req.session.gameData.gameArray[req.session.gameData.movieCount].path, lastGame: true });
        } else {
            return res.render("startGame.ejs", { link: req.session.gameData.gameArray[req.session.gameData.movieCount].path });
        }
    } catch (error) {
        console.error("Error in submitting answer:", error.message || error);
        // Send an error response only if no other response has been sent
        if (!res.headersSent) {
            res.status(501).json({ error: "Internal server error while submitting the answer" });
        }
    }
});

// Finish the game and reset state
app.post("/finish", async (req, res) => {
    //first check answer of last level
    req.session.gameData.movieCount++;
    const userAnswer = req.body.userInput;
    if (userAnswer) {
        const correctAnswer = req.session.gameData.gameArray[req.session.gameData.movieCount - 1].title;
        //check answer
        const response = await axios.get("https://guesstheframeapiserver.onrender.com/checkAnswer", { params : {
            correctAns : correctAnswer,
            userAns : userAnswer,
        },});
        if (response.data.userGetMark) {
            req.session.gameData.correctAnsCount++;
            console.log(req.session.gameData.movieCount,"Correct Answer");
        } else {
            req.session.gameData.wrongAnsCount++;
            console.log(req.session.gameData.movieCount,"Incorrect Answer, correct title is : ", correctAnswer);
        }
    } else {
        req.session.gameData.skipLevelCount++;
        console.log(req.session.gameData.movieCount, "User Skipped this level");
    }
    // Clear the session flag as the game is complete
    req.session.gameInProgress = false;
    //render scorecard
    const finishGameParams = {
        finalScore: ((req.session.gameData.correctAnsCount * 4) - (req.session.gameData.wrongAnsCount * 1)),
        totalFrames: TOTAL_MOVIES,
        rightAns: req.session.gameData.correctAnsCount,
        wrongAns: req.session.gameData.wrongAnsCount,
        skipFrame: req.session.gameData.skipLevelCount,
    };
    req.session.gameData.movieCount = 0;
    req.session.gameData.correctAnsCount = 0;
    req.session.gameData.wrongAnsCount = 0;
    req.session.gameData.skipLevelCount = 0;
    req.session.gameData.gameArray = [];
    res.render("finishGame.ejs",finishGameParams);
});

// Render the home page
app.get("/", (req, res) => {
    // Check if a game is already in progress
    if (req.session.gameInProgress) {
        return res.status(400).send("A game is already in progress. Please finish or restart the current game.");
    }
    res.render("index.ejs");
});

app.get("/restart", (req, res)=> {
    res.render("index.ejs");
});

