
var _ = require('lodash'),
  redis = require('redis'),
  createGithubApi = require('./create-github-api.js');

// Session backed by Redis, but that
// attempts to lookup against GHE if
// the token is not found in the DB.
function SessionGithub(opts) {
  _.extend(this, {
    client: redis.createClient(),
    githubHost: 'api.github.com',
    debug: true,
    githubPathPrefix: '/api/v3'
  }, require('@npm/enterprise-configurator').Config(), opts)
}

SessionGithub.prototype.get = function(key, cb) {
  var _this = this;

  this.client.get(key, function(err, data) {
    if (err) cb(err);
    else if (data) cb(null, JSON.parse(data));
    else { // attempt to lookup user in GHE.
      _this._githubLookup(key, cb);
    }
  });
};

SessionGithub.prototype._githubLookup = function(key, cb) {
  var _this = this,
    github = createGithubApi(this),
    // extract the GHE key from the user-<token> string.
    token = key.split('-').splice(1).join('-');

  github.authenticate({
    type: 'oauth',
    token: token
  });

  github.user.get({}, function(err, res) {
    if (err) cb(err);
    else if (res.code < 200 || res.code >= 400) cb(Error('status = ' + res.code));
    else {
      var session = {
        name: res.login,
        email: res.email
      };

      _this.set(key, session, function(err) {
        if (err) cb(err);
        else cb(undefined, session);
      });
    }
  });
};

SessionGithub.prototype.set = function(key, session, cb) {
  this.client.set(key, JSON.stringify(session), cb);
};

module.exports = SessionGithub;
