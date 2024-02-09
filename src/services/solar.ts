import axios from "axios"
import { GOOGLE_KEY } from "@/config";
import { Coordinates } from "solar-typing/src/general"
import { BuildingInsights, LayerId, Layer, SolarLayers, GeoTiff } from "solar-typing/src/solar"

import { Client, } from "@googlemaps/google-maps-services-js"
import { downloadGeoTIFF, renderPalette } from "@/misc/solar";
import { ironPalette, sunlightPalette} from "@/misc/constants";
import * as geotiff from "geotiff";
import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";
import proj4 from "proj4";

const client = new Client({});

export async function getClosestBuildingInsights(coord: Coordinates) {
    // https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest
    return await axios({
        method: "get",
        responseType: 'json',
        url: "https://solar.googleapis.com/v1/buildingInsights:findClosest",
        params: {
            key: GOOGLE_KEY,
            "location.latitude": coord.lat.toFixed(5),
            "location.longitude": coord.lng.toFixed(5)
        }
    })
        .then((response) => {
            return response.data as BuildingInsights;
        })
        .catch((error) => {
            console.log(error);
            return null;
        });
}

export async function getSolarLayers(coord: Coordinates, radius: number) {
    // https://developers.google.com/maps/documentation/solar/data-layers
    return await axios({
        method: "get",
        responseType: 'json',
        url: "https://solar.googleapis.com/v1/dataLayers:get",
        params: {
            key: GOOGLE_KEY,
            "location.latitude": coord.lat.toFixed(5),
            "location.longitude": coord.lng.toFixed(5),
            radiusMeters: radius.toString(),
            view: "FULL_LAYERS",
            requiredQuality: "HIGH",
        }
    })
        .then((response) => {
            return response.data as SolarLayers;
        })
        .catch((error) => {
            console.log(error);
            return null;
        });
}

export async function getGeotiff(url: string) {
    return await axios({
        method: "get",
        responseType: 'arraybuffer',
        url: url,
        params: {
            key: GOOGLE_KEY
        }
    })
        .then(async (response) => {
            const arraybuffer: ArrayBuffer = response.data;
            const tiff = await geotiff.fromArrayBuffer(arraybuffer);
            const image = await tiff.getImage();
            const rasters = await image.readRasters();

            const geoKeys = image.getGeoKeys();
            const projObj = geokeysToProj4.toProj4(geoKeys);
            const projection = proj4(projObj.proj4, "WGS84");
            const box = image.getBoundingBox();
            const sw = projection.forward({
                x: box[0] * projObj.coordinatesConversionParameters.x,
                y: box[1] * projObj.coordinatesConversionParameters.y,
            });
            const ne = projection.forward({
                x: box[2] * projObj.coordinatesConversionParameters.x,
                y: box[3] * projObj.coordinatesConversionParameters.y,
            });

            return {
                width: rasters.width,
                height: rasters.height,
                rasters: [...Array(rasters.length).keys()].map((i) => Array.from(rasters[i] as geotiff.TypedArray)),
                bounds: {
                    north: ne.y,
                    south: sw.y,
                    east: ne.x,
                    west: sw.x,
                }
            } as GeoTiff;
        })
        .catch((error) => {
            console.log(error);
            return null;
        });
}

export async function getSingleSolarLayer(layerId: LayerId, urls: SolarLayers) {
    const get: Record<LayerId, () => Promise<Layer>> = {
        annualFlux: async () => {
            const [mask, data] = await Promise.all([
                downloadGeoTIFF(urls.maskUrl),
                downloadGeoTIFF(urls.annualFluxUrl),
            ]);
            const colors = ironPalette;
            return {
                id: layerId,
                bounds: mask.bounds,
                palette: {
                    colors: colors,
                    min: "Shady",
                    max: "Sunny",
                },
                render: (showRoofOnly) => [
                    renderPalette({
                        data: data,
                        mask: showRoofOnly ? mask : undefined,
                        colors: colors,
                        min: 0,
                        max: 1800,
                    }),
                ],
            };
        },
        monthlyFlux: async () => {
            const [mask, data] = await Promise.all([
                downloadGeoTIFF(urls.maskUrl),
                downloadGeoTIFF(urls.monthlyFluxUrl),
            ]);
            const colors = ironPalette;
            return {
                id: layerId,
                bounds: mask.bounds,
                palette: {
                    colors: colors,
                    min: "Shady",
                    max: "Sunny",
                },
                render: (showRoofOnly) =>
                    [...Array(12).keys()].map((month) =>
                        renderPalette({
                            data: data,
                            mask: showRoofOnly ? mask : undefined,
                            colors: colors,
                            min: 0,
                            max: 200,
                            index: month,
                        }),
                    ),
            };
        },
        hourlyShade: async () => {
            const [mask, ...months] = await Promise.all([
                downloadGeoTIFF(urls.maskUrl),
                ...urls.hourlyShadeUrls.map((url) => downloadGeoTIFF(url)),
            ]);
            const colors = sunlightPalette;
            return {
                id: layerId,
                bounds: mask.bounds,
                palette: {
                    colors: colors,
                    min: "Shade",
                    max: "Sun",
                },
                render: (showRoofOnly, month, day) =>
                    [...Array(24).keys()].map((hour) =>
                        renderPalette({
                            data: {
                                ...months[month],
                                rasters: months[month].rasters.map((values) => values.map((x) => x & (1 << (day - 1)))),
                            },
                            mask: showRoofOnly ? mask : undefined,
                            colors: colors,
                            min: 0,
                            max: 1,
                            index: hour,
                        }),
                    ),
            };
        },
    };
}