var Organization = require("../models/Organization");

// Parses stringified stats and makes dates usable by javascript
var parseStats = function(statString) {
  // Every so often, GitHub gives us an undefined, just return out with an empty array
  if (!statString) return [];
  // If there's nothing there, we'll just assign it to an empty array
  var stats = JSON.parse(statString.length > 0 ? statString : "[]");

  // Every so often, we get an Object instead of an Array from Github. The rest of our code expects arrays
  return Array.isArray(stats) ? stats : [];
};

// Middleware to get the requested org from mongo
exports.getOrganization = function(req, res, next) {
  org = req.query.org || 'hackreactor'; // Allow users to send custom org over query string
  console.log('getting organization data for ', org);
  // Check to see if organization already exists in our db and create a new one if not
  Organization.findOne({ username: org }, function(err, existingOrg) {
    if (existingOrg) {
      req.org = existingOrg; // Pass on reference to the existing org
      next();
    } else {
      res.send(404);
    }
  });
};

/**
 * GET /api/stats/code_frequency
 * Converts all repo's codeFrequency stats stored on user into just those since last Sunday
 * Format for d3 -> [{username, repo_name, additions, deletions, net}, ...]
 */

exports.getCodeFrequency = function(req, res) {
  var stats = [];

  // Ignore any members with empty repos
  var filtered = req.org.members.filter(function(member) {
    return member.repos.length > 0;
  });

  filtered.forEach(function(member) {
    member.repos.forEach(function(repo) {
      console.log('stats:', repo.stats.codeFrequency);
      parseStats(repo.stats.codeFrequency).forEach(function(stat) {
        // console.log("repo: ", repo.name, "date: ", stat[0]);
        // codeFrequency stats come in tuples [date, additions, deletions]
        // We want to make sure there's at least some action!
        if (isLastSaturday(stat[0]) && stat[1] > 0 && stat[2] < 0) {
          console.log("found a repo:", repo.name, " from this week! it adds " , stat[1] , " lines and removes ", stat[2], " lines for a total of ", stat[1] + stat[2], " new lines ");
          // d3 friendly format (see above)
          stats.push({
            username: member.username,
            repo: repo.name,
            additions: stat[1],
            deletions: -stat[2], // Convert negative to positive
            net: stat[1] + stat[2]
          });
        }
      });
    });
  });

  // sorts stats in descending order by number of additions
  stats = stats.sort(function(a,b) {
    return b.additions - a.additions;
  });

  res.send(stats);

  // Date -> Bool ****THIS NEEDS TO BE FIXED. github is weird with the times it passes into codeFreq. Figure this out****
  function isLastSaturday(date) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var saturday = new Date(today.setDate(today.getDate()-today.getDay()-1));
    return date === saturday.setHours(saturday.getHours()+16) / 1000;
  }
};


/**
 * GET /api/stats/punch_card
 * Formats authorized users' members array into punch card dataset usable by d3
 * Format for d3 -> [{day, hour, commits, repos}, ...]
 */
 
exports.getPunchCard = function(req, res) {
  var stats = initializeStats();

  // Ignore any members with empty repos
  var filtered = req.org.members.filter(function(member) {
    return member.repos.length > 0;
  });

  filtered.forEach(function(member) {
    member.repos.forEach(function(repo) {
      parseStats(repo.stats.punchCard).forEach(function(stat, i) {
        // punchCard stats come in tuples [day, hour, number of commits]
        // For example, [2, 14, 25] indicates that there were 25 total commits, during the 2:00pm hour on Tuesdays. All times are based on the time zone of individual commits.
        // We want to make sure there's at least some action!
        if (stat[2] > 0) {
          console.log("found a repo:", repo.name, " from this week! at day " , stat[0] , " hour ", stat[1], " with number of commits: ", stat[2]);
          // d3 friendly format (see above)
          stats[i].commits += stat[2];
          stats[i].repos.push({
            user: member.username,
            repo: repo.name,
            commits: stat[2]
          });
        }
      });
    });
  });

  res.send(stats);

  function initializeStats(){
    var stats = [];
    for (var day = 0; day < 7; day++) {
      for (var hour = 0; hour < 24; hour++) {
        stats.push({
          day: day,
          hour: hour,
          commits: 0,
          repos: []
        });
      }
    }
    return stats;
  }
}