
var _ = require('lodash'),
  redis = require('redis'),
  createGithubApi = require('./create-github-api.js');

// Session backed by Redis, but that
// attempts to lookup against GHE if
// the token is not found in the DB.
function SessionGithub(opts) {
  _.extend(this, {
    client: redis.createClient(process.env.LOGIN_CACHE_REDIS),
    githubHost: 'api.github.com',
    debug: true,
    githubPathPrefix: '/api/v3'
  }, require('@npm/enterprise-configurator').Config(), opts)
}

SessionGithub.prototype.get = function(key, cb) {
  var _this = this;

  // First check if we have the session in Redis.
  this.client.get(key, function(err, data) {
    if (err) cb(err);
    // If we do, simply return the existing session.
    else if (data) cb(null, JSON.parse(data));
    else {
      // If we don't, talk to GHE instance. This can happen when, for example,
      // user tries logging into a different npm Enterprise instance with an
      // existing, logged in .npmrc.
      _this._githubLookup(key, cb);
    }
  });
};

SessionGithub.prototype._githubLookup = function(key, cb) {
  var _this = this,
    github = createGithubApi(this),
    // extract the GHE key from the user-<token> string.
    token = key.split('-').splice(1).join('-');

  // the token authenticator creates is a GitHub OAuth token, so we can simply
  // try authenticating with it and then fetching the authenticated user.
  github.authenticate({
    type: 'oauth',
    token: token
  });

  github.users.get({}, function(err, res) {
    if (err) cb(err);
    else if (res.code < 200 || res.code >= 400) cb(Error('status = ' + res.code));
    else {
      var session = {
        name: res.login,
        email: res.email || 'npme@example.com'
      };

      // If authentication with GitHub succeeded, persist the GitHub login and
      // email in our session store.
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
