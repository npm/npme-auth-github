var parseUrl = require('url'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  createGithubApi = require('./create-github-api.js'),
  config = require('@npm/enterprise-configurator').Config();

function AuthorizeGithub(opts) {
  _.extend(this, {
    packagePath: null, // required, name-spaced package name.
    debug: true,
    githubHost: config.githubHost,
    githubPathPrefix: '/api/v3',
    // label the token that we generate.
    note: 'npm on premises solution',
    noteUrl: 'https://www.npmjs.org'
  }, opts);
}

// Reach out to GitHub API to authenticate the user. Create an authorization
// token and pass it back as it is, allowing the authorizer to verify it through
// GitHub API later on.
AuthorizeGithub.prototype.authenticate = function(credentials, cb) {
  if (!this._validateCredentials(credentials)) return cb(Error('invalid credentials format'));

  var body = credentials.body,
    username = body.name,
    password = body.password,
    twoFactorCode = body.code;

  this.getAuthorizationToken(username, password, twoFactorCode)
    .then(function(token) {
      cb(undefined, {
        token: token,
        user: {
          name: username,
          email: body.email
        }
      });
    })
    .catch(function(err) {
      if (err.code === 401) {
        err.message = 'unauthorized';
        // this is a failure to auth, but not an error
        cb(null,err);
      } else if (err.code === 500) {
        err.message = 'GitHub enterprise unavailable';
        // this is an error state
        cb(err)
      }
    })
    .done();
};

AuthorizeGithub.prototype._validateCredentials = function(credentials) {
  if (!credentials) return false;
  if (!credentials.body) return false;
  if (!credentials.body.name || !credentials.body.password) return false;
  return true;
};

// Actually create the authorization token.
AuthorizeGithub.prototype.getAuthorizationToken = function(username, password, twoFactorCode) {
  var _this = this,
    github = createGithubApi(this);

  github.authenticate({
    type: 'basic',
    username: username,
    password: password
  });

  return new Promise(function(resolve, reject) {
    github.authorization.create({
      scopes: ["user", "public_repo", "repo", "repo:status", "gist"],
      // timestamp helps prevent duplicate tokens.
      note: _this.note + ' (' + new Date().getTime() + ')',
      note_url: _this.noteUrl,
      headers: {
        "X-GitHub-OTP": twoFactorCode
      }
    }, function(err, res) {
      if (err) reject(err);
      else resolve(res.token);
    });
  });
};

module.exports = AuthorizeGithub;
