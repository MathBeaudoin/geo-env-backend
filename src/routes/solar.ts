import express from "express";
import {} from "solar-typing/src/general"
import {} from "solar-typing/src/solar"

const router = express.Router();


router.get("/", (req, res) => {
    console.log(1234);
    res.json({
        test: "test"
    });
});

export default router;
