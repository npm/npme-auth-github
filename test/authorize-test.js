var config = require('@npm/enterprise-configurator').Config({
    headless: true
  }),
  lab = require('lab'),
  Lab = exports.lab = lab.script(),
  Code = require('code'),
  nock = require('nock'),
  AuthorizeGithub = require('../authorizer.js'),
  Promise = require('bluebird'),
  fs = require('fs'),
  assert = require('assert'),
  redis = require('redis');

Lab.experiment('parseGitUrl', function() {

  Lab.test('it parses url and returns components for github api', function(done) {
    var ga = new AuthorizeGithub({
      debug: false
    });

    ga.parseGitUrl({
      repository: { url: 'http://github.npm.com/npm/thumbd.git' }
    }).done(function(params) {
      Code.expect(params.org).to.equal('npm');
      Code.expect(params.repo).to.equal('thumbd');
      done();
    });
  });

  Lab.test('it gracefully handles an invalid url', function(done) {
    var ga = new AuthorizeGithub({
      debug: false
    });

    ga.parseGitUrl({
      repository: { url: 'github.com/npm' }
    }).catch(function(err) {
      Code.expect(err.message).to.match(/does not appear/);
      done();
    }).done();
  });

  Lab.test('it gracefully handles a missing url', function(done) {
    var ga = new AuthorizeGithub({
      debug: false
    });

    ga.parseGitUrl().catch(function(err) {
      Code.expect(err.message).to.match(/Cannot read property/);
      done();
    }).done();
  });

  Lab.test('it supports git:// format url', function(done) {
    var ga = new AuthorizeGithub({
      githubHost: 'github.npmjs.com',
      debug: false
    });

    ga.parseGitUrl({
      repository: {url: 'git://github.npmjs.com/npm/foobar'}
    }).done(function(params) {
      Code.expect(params.org).to.equal('npm');
      Code.expect(params.repo).to.equal('foobar');
      done();
    });
  });

  Lab.test('it defaults to https if git:// format url is provided', function(done) {
    var ga = new AuthorizeGithub({
      githubHost: 'github.npmjs.com',
      debug: false
    });

    ga.parseGitUrl({
      repository: {url: 'git://github.npmjs.com/npm/foobar'}
    }).done(function(params) {
      Code.expect(params.org).to.equal('npm');
      Code.expect(params.repo).to.equal('foobar');
      done();
    });
  });

  Lab.test('it supports the git@ format url', function(done) {
    var ga = new AuthorizeGithub({
      githubHost: 'github.npmjs.com',
      debug: false
    });

    ga.parseGitUrl({
      repository: {url: 'git@github.npmjs.com:npm/foobar.git'}
    }).done(function(params) {
      Code.expect(params.org).to.equal('npm');
      Code.expect(params.repo).to.equal('foobar');
      done();
    });
  });
});

Lab.experiment('loadPackageJSON', function() {

  Lab.test('returns parsed package.json', function(done) {
    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm/foobar',
      debug: false
    });

    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm/foobar?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npm.com/npm/thumbd.git' }
      }));

    ga.loadPackageJSON().done(function(package) {
      Code.expect(package.repository.url).to
        .equal('http://github.npm.com/npm/thumbd.git');
      packageApi.done();
      done();
    });
  });

  Lab.test('gracefully handles request returning an error', function(done) {
    nock.cleanAll();

    var ga = new AuthorizeGithub({
      frontDoorHost: '/not/a/url',
      packagePath: '/@npm/foobar',
      debug: false
    });

    ga.loadPackageJSON()
      .catch(function(err) {
        Code.expect(err.message).to.match(/Invalid URI/);
        done();
      }).done();
  });

  Lab.test('uses port parsed from githubHost', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for user with read-only permissions.
    var githubApi = nock('https://github.example.com:4444')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-only.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      githubHost: 'https://github.example.com:4444',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'read',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

});

Lab.experiment('isAuthorized', function() {

  Lab.test('authorization succeeds if scope read, and user can pull', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for user with read-only permissions.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-only.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'read',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization fails if repo is not found and permissions are read', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for user with read-only permissions
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(404)

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'read',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert.equal(authorized, false);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization succeeds on publish, if repo is not found', function(done) {
    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(404);

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'publish',
      untrustedPackageJson: {
        'dist-tags': {latest: '0.0.0'},
        versions: {
          '0.0.0': {
            repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
          }
        }
      },
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization fails on publish, if user cannot push', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for user with read-only permissions
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-only.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'push',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert.equal(authorized, false);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization succeeds on publish, if user can push', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'publish',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization fails on publish, if git-URL-org does not match githubOrg', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'publish',
      githubOrg: 'foobar',
      debug: false
    });

    ga.isAuthorized().catch(function(err) {
      assert.equal(err.message, 'invalid organization name');
      done();
    });
  });

  Lab.test('authorization succeeds on publish, if git-URL-org matches githubOrg', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'publish',
      githubOrg: 'npm-test',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test('authorization succeeds on publish, if git-URL-org matches any githubOrg', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      packagePath: '/@npm-test/foo',
      token: 'banana',
      scope: 'publish',
      githubOrg: 'otherOrg, npm-test, org3',
      debug: false
    });

    ga.isAuthorized().done(function(authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

});

Lab.experiment('authorize', function() {
  Lab.test('it updates object with parameters from credentials', function(done) {
    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      isAuthorized: function() {
        return new Promise(function(resolve, reject) {
          resolve(true)
        })
      },
      debug: false
    });

    ga.authorize({
      method: 'GET',
      headers: {
        'authorization': 'Bearer banana'
      },
      path: '/@npm-test/foo'
    }, function(err, authorization) {
      assert.equal('read', ga.scope);
      assert.equal('/@npm-test/foo', ga.packagePath);
      assert.equal('banana', ga.token);
      done();
    });
  });

  Lab.test('it should invoke callback with authorization, upon success', function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      debug: false
    });

    ga.authorize({
      method: 'GET',
      headers: {
        'authorization': 'Bearer banana'
      },
      path: '/@npm-test/foo'
    }, function(err, authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test("it should append '/' on to the fetched package url if credentials.path is not prefixed with one", function(done) {

    // HTTP response for loading package.json
    var packageApi = nock('http://frontdoor.npmjs.com')
      .get('/@npm-test/foo?sharedFetchSecret=' + config.sharedFetchSecret)
      .reply(200, JSON.stringify({
        repository: { url: 'http://github.npmjs.com/npm-test/foo.git' }
      }));

    // HTTP response for use with read/write permissions on repo.
    var githubApi = nock('https://github.example.com')
      .get('/api/v3/repos/npm-test/foo?access_token=banana')
      .reply(200, fs.readFileSync('./test/fixtures/read-write.json'), {
        'content-type': 'application/json; charset=utf-8'
      })

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      debug: false
    });

    ga.authorize({
      method: 'GET',
      headers: {
        'authorization': 'Bearer banana'
      },
      path: '@npm-test/foo'
    }, function(err, authorized) {
      assert(authorized);

      packageApi.done();
      githubApi.done();
      done();
    });
  });

  Lab.test("it should return an error if bearer token can't be parsed", function(done) {

    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      debug: false
    });

    ga.authorize({
      method: 'GET',
      headers: {
        'authorization': null
      },
      path: '/@npm-test/foo'
    }, function(err, authorized) {
      Code.expect(authorized).to.equal(false);
      done();
    });
  });

  Lab.test("it should return an error if no credentials are provided", function(done) {
    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      debug: false
    });

    ga.authorize(null, function(err, authorized) {
      Code.expect(authorized).to.equal(false);
      done();
    });
  });
});

Lab.experiment('whoami', function() {
  var client = redis.createClient(),
    token = 'footoken';

  Lab.before(function(done) {
    client.del('user-' + token, function() {
      done();
    });
  });

  Lab.it('looks up user using GitHub API if not found in redis', function(done) {
    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      githubHost: 'https://github.example.com',
      debug: false
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=footoken')
      .reply(200, fs.readFileSync('./test/fixtures/user-get.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    ga.whoami({
      method: 'GET',
      headers: {
        'authorization': 'Bearer ' + token
      },
      path: '/@npm-test/foo'
    }, function(err, data) {
      Code.expect(data.name).to.deep.equal('bcoe');
      Code.expect(data.email).to.deep.equal('ben@npmjs.com');
      githubApi.done();
      done();
    });
  });

  Lab.it('returns user from redis if cached', function(done) {
    var ga = new AuthorizeGithub({
      frontDoorHost: 'http://frontdoor.npmjs.com',
      debug: false
    });

    ga.whoami({
      method: 'GET',
      headers: {
        'authorization': 'Bearer ' + token
      },
      path: '/@npm-test/foo'
    }, function(err, data) {
      Code.expect(data.name).to.deep.equal('bcoe');
      Code.expect(data.email).to.deep.equal('ben@npmjs.com');
      done();
    });
  });
});
