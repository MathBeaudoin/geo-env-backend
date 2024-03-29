import express from "express";
import { Coordinates } from "geo-env-typing/geo";
import { getGeocoding, getReverseGeocoding } from "@/services/geo";
import { ApiError } from "@/misc/customErrors";

const geoRouter = express.Router();

geoRouter.get("/geo/geocoding", async (req, res, next) => {
    const formattedAddress = req.query.address as string;

    await getGeocoding(formattedAddress)
        .then((data) => {
            res.status(200).json({
                coordinates: data
            });
        })
        .catch((error) => {
            next(new ApiError(req.url));
        });
});

geoRouter.get("/geo/reverse-geocoding", async (req, res, next) => {
    const coord: Coordinates = {
        lat: Number(req.query.lat),
        lng: Number(req.query.lng)
    };

    await getReverseGeocoding(coord)
        .then((data) => {
            res.status(200).json({
                address: data
            });
        })
        .catch((error) => {
            next(new ApiError(req.url));
        });
});

export default geoRouter;
