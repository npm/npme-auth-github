var lab = require('lab'),
  Lab = exports.lab = lab.script(),
  Code = require('code'),
  nock = require('nock'),
  fs = require('fs'),
  SessionGithub = require('../session.js'),
  redis = require('redis'),
  config = require('@npm/enterprise-configurator').Config({
    githubHost: "https://api.github.com",
    verbose: true
  }),
  client = redis.createClient(),
  token = 'user-foobar';

Lab.experiment('get', function() {

  Lab.beforeEach(function(done) {
    client.del(token, function() {
      done();
    });
  });

  Lab.test('if user is not found in DB, user is looked up via GitHub API', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com',
      debug: false
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(200, fs.readFileSync('./test/fixtures/user-get.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    session.get(token, function(err, data) {
      Code.expect(data.name).to.deep.equal('bcoe');
      Code.expect(data.email).to.deep.equal('ben@npmjs.com');
      githubApi.done();
      done();
    });
  });

  Lab.test('it creates session in Redis if user found in GitHub API', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com',
      debug: false
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(200, fs.readFileSync('./test/fixtures/user-get.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    session.get(token, function(err, data) {
      githubApi.done();
      client.get(token, function(err, sessionJson) {
        var session = JSON.parse(sessionJson);
        Code.expect(session.name).to.deep.equal('bcoe');
        Code.expect(session.email).to.deep.equal('ben@npmjs.com');
        done();
      });
    });
  });

  Lab.test('it returns an error if GitHub API returns non 200', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com',
      debug: false
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(500);

    session.get(token, function(err, data) {
      githubApi.done();
      Code.expect(err.code).to.deep.equal(500);
      done();
    });
  });

});
