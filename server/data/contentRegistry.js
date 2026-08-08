function getSolutions() {
  return require("./solutions").solutions;
}

function getIndustries() {
  return require("./industries").industries;
}

function getRecLandings() {
  return require("./recLandings").getRecLandings();
}

module.exports = {
  getSolutions,
  getIndustries,
  getRecLandings,
};
