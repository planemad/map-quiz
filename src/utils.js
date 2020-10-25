import { bbox } from "@turf/turf";
import { parse } from "./wellknown.js";

const apiurl = "https://query.wikidata.org/sparql?query=";

// Function to get place names and codes
export async function getPlaces() {
  let query = `
SELECT DISTINCT ?country ?countryLabel ?capital ?capitalLabel
WHERE
{
  ?country wdt:P31 wd:Q3624078 .
  #not a former country
  FILTER NOT EXISTS {?country wdt:P31 wd:Q3024240}
  #and no an ancient civilisation (needed to exclude ancient Egypt)
  FILTER NOT EXISTS {?country wdt:P31 wd:Q28171280}
  OPTIONAL { ?country wdt:P36 ?capital } .

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY ?countryLabel
`;
  let response = await fetch(apiurl + encodeURIComponent(query), {
    headers: { accept: "application/sparql-results+json" },
  });
  let json = await response.json();
  let data = json.results.bindings;
  console.log(data);
  // data = [{
  //   code: "E08000001",
  //   name: "Bolton"
  // },{
  //   code: "E08000003",
  //   name: "Bolton1"
  // },{
  //   code: "E08000004",
  //   name: "Bolton2"
  // },{
  //   code: "E080000037",
  //   name: "Bolton3"
  // }];

  return data;
}

// Function to get boundary polygon based on place code
export async function getLocation(item) {
  console.log(item);
  let query = `
  select ?location where {
    wd:${item.value.replace(
      "http://www.wikidata.org/entity/",
      ""
    )} wdt:P625 ?location. # And location
service wikibase:label { bd:serviceParam wikibase:language "en". } # Show names in Dutch
}
`;
  let response = await fetch(apiurl + encodeURIComponent(query), {
    headers: { accept: "application/sparql-results+json" },
  });
  let json = await response.json();
  let data = json.results.bindings;
  console.log(data);

  // Convert polygon from WKT to geojson format
  let geojson = await parse(data[0].location.value);

  // Get the lon/lat bounding box of the polygon
  let bounds = await bbox(geojson);

  return {
    geometry: geojson,
    bounds: bounds,
  };
}

// Select a random place from an array of places
export function rndPlace(places) {
  let num = Math.floor(Math.random() * places.length);
  return places[num];
}

// Function to return an array in a random order
export function shuffle(array) {
  var currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}
