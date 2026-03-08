function getSolutions() {
  return require("./solutions").solutions;
}

function getIndustries() {
  return require("./industries").industries;
}

module.exports = {
  getSolutions,
  getIndustries,
};