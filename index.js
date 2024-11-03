import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
const port = 3000;
const TOTAL_MOVIES = 20; // Define a constant for total movies
let gameArray = [];
let movieCount = 0;
let correctAnsCount = 0;
let wrongAnsCount = 0;
let skipLevelCount = 0;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Shuffle the game array using Fisher-Yates algorithm
function shuffleGameArray() {
    for (let i = gameArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameArray[i], gameArray[j]] = [gameArray[j], gameArray[i]];
    }
}

// Start the game
app.post("/startGame", async (req, res) => {
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
        gameArray = responses.flatMap(response => response.data); // Combine all responses
        shuffleGameArray(); // Shuffle the game array
        console.log("Successfully created Game Array");
        gameArray.forEach(movie => {
            console.log(movie.title);
        });
        movieCount = 0; // Reset movieCount at the start of a new game
        res.render("startGame.ejs", { link: gameArray[movieCount].path });
        // movieCount++;
    } catch (error) {
        console.error('Error fetching movie frames:', error);
        res.status(500).send("Failed to fetch movie frames.");
    }
});

// Move to the next movie frame
app.post("/skip", async (req, res) => {
    movieCount++;
    skipLevelCount++;
    console.log(movieCount,"User Skipped this level");
    if (movieCount === TOTAL_MOVIES - 1) {
        return res.render("startGame.ejs", { link: gameArray[movieCount].path, lastGame: true });
    }
    res.render("startGame.ejs", { link: gameArray[movieCount].path });
});

// Submit the user's answer
app.post("/submit", async (req, res) => {
    movieCount++;
    try {
        const userAnswer = req.body.userInput;
        console.log(userAnswer);
        const correctAnswer = gameArray[movieCount - 1].title;
        //check answer
        const response = await axios.get("https://guesstheframeapiserver.onrender.com/checkAnswer", { params : {
            correctAns : correctAnswer,
            userAns : userAnswer,
        },});
        if (response.data.userGetMark){
            correctAnsCount++;
            console.log(movieCount,"Correct Answer");
        }else{
            wrongAnsCount++;
            console.log(movieCount,"Incorrect Answer, correct title is : ", correctAnswer);
        }
        
        if (movieCount === TOTAL_MOVIES - 1) {
            return res.render("startGame.ejs", { link: gameArray[movieCount].path, lastGame: true });
        } else {
            return res.render("startGame.ejs", { link: gameArray[movieCount].path });
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
    movieCount++;
    const userAnswer = req.body.userInput;
    if (userAnswer) {
        const correctAnswer = gameArray[movieCount - 1].title;
        //check answer
        const response = await axios.get("https://guesstheframeapiserver.onrender.com/checkAnswer", { params : {
            correctAns : correctAnswer,
            userAns : userAnswer,
        },});
        if (response.data.userGetMark) {
            correctAnsCount++;
            console.log(movieCount,"Correct Answer");
        } else {
            wrongAnsCount++;
            console.log(movieCount,"Incorrect Answer, correct title is : ", correctAnswer);
        }
    } else {
        skipLevelCount++;
        console.log(movieCount, "User Skipped this level");
    }
    //render scorecard
    const finishGameParams = {
        finalScore: ((correctAnsCount * 4) - (wrongAnsCount * 1)),
        totalFrames: TOTAL_MOVIES,
        rightAns: correctAnsCount,
        wrongAns: wrongAnsCount,
        skipFrame: skipLevelCount,
    };
    movieCount = 0;
    correctAnsCount = 0;
    wrongAnsCount = 0;
    skipLevelCount = 0;
    gameArray = [];
    res.render("finishGame.ejs",finishGameParams);
});

// Render the home page
app.get("/", (req, res) => {
    res.render("index.ejs");
});

app.get("/restart", (req, res)=> {
    res.render("index.ejs");
});

