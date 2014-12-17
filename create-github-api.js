var _ = require('lodash'),
  GithubApi = require('github'),
  config = require('@npm/enterprise-configurator').Config(),
  url = require('url');

// helper for generating a GitHub API instance
// from a GitHub or GitHub Enterprise URL.
module.exports = function(githubParams) {
  var parsedUrl = url.parse(githubParams.githubHost),
    protocol = parsedUrl.protocol ? parsedUrl.protocol.replace(':', '') : 'https',
    githubOpts = {
      version: "3.0.0",
      debug: githubParams.debug,
      timeout: 30000,
      tokenName: 'npm Enterprise solution'
    };

  // GHE Domain.
  if (parsedUrl.host.indexOf('api.github.com') === -1) {
    githubOpts.protocol = protocol;
    githubOpts.port = parsedUrl.port ? parsedUrl.port : {'http': 80, 'https': 443}[protocol];
    githubOpts.host = parsedUrl.host.replace(/:.*$/, '');
    githubOpts.pathPrefix = githubParams.githubPathPrefix;
  }

  return new GithubApi(githubOpts);
};
