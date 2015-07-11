/* globals app,window */

app.controller("OmniController", function($scope, $rootScope, storage, api, search) {
  $rootScope.omni = $scope;
  $scope.inputs = {
    omni: storage.tcOmni || "",
    provider: storage.tcProvider || "tpb"
  };
  //edit fields
  $scope.edit = false;
  $scope.trackers = [{ v: "" }];
  $scope.providers = {};
  $scope.$watch("inputs.provider", function(p) {
    if(p) storage.tcProvider = p;
    $scope.parse();
  });
  //if unset, set to first provider
  $rootScope.$watch("data.SearchProviders", function(searchProviders) {
    //remove last set
    if(!searchProviders)
      return;
    //filter
    for(var id in searchProviders) {
      if(/-item$/.test(id)) continue;
      $scope.providers[id] = searchProviders[id];
    }
    $scope.parse();
  });

  var parseTorrent = function() {
    $scope.mode.torrent = true;
  };

  var parseMagnet = function(params) {
    $scope.mode.magnet = true;
    var m = window.queryString.parse(params);

    if (!/^urn:btih:([A-Za-z0-9]+)$/.test(m.xt)) {
      $scope.omnierr = "Invalid Info Hash";
      return;
    }

    $scope.infohash = RegExp.$1;
    $scope.name = m.dn || "";
    //no trackers :O
    if (!m.tr)
      return;
    //force array
    if (!(m.tr instanceof Array))
      m.tr = [m.tr];

    //in place map
    for (var i = 0; i < m.tr.length; i++)
      $scope.trackers[i] = { v: m.tr[i] };

    while ($scope.trackers.length > m.tr.length)
      $scope.trackers.pop();

    $scope.trackers.push({ v: "" });
  };

  var parseSearch = function() {
    $scope.mode.search = true;
    while ($scope.results.length)
      $scope.results.pop();
  };

  $scope.parse = function() {
    storage.tcOmni = $scope.inputs.omni;
    $scope.omnierr = null;
    //set all 3 to false,
    //one will set to be true
    $scope.mode = {
      torrent: false,
      magnet: false,
      search: false
    };
    $scope.page = 1;
    $scope.hasMore = true;
    $scope.noResults = false;
    $scope.results = [];

    if (/^https?:\/\//.test($scope.inputs.omni))
      parseTorrent();
    else if (/^magnet:\?(.+)$/.test($scope.inputs.omni))
      parseMagnet(RegExp.$1);
    else if ($scope.inputs.omni)
      parseSearch();
    else
      $scope.edit = false;
  };
  $scope.parse();

  var magnetURI = function(name, infohash, trackers) {
    return "magnet:?" +
      "xt=urn:btih:" + (infohash || '') + "&" +
      "dn=" + (name || '').replace(/\W/g, '').replace(/\s+/g, '+') +
      (trackers || []).map(function(t) {
        return "&tr=" + encodeURIComponent(t.v);
      }).join('');
  };

  $scope.stringify = function() {
    $scope.omnierr = null;

    if (!/^[A-Za-z0-9]+$/.test($scope.infohash)) {
      $scope.omnierr = "Invalid Info Hash";
      return;
    }

    for (var i = 0; i < $scope.trackers.length;)
      if (!$scope.trackers[i].v)
        $scope.trackers.splice(i, 1);
      else
        i++;

    $scope.inputs.omni = magnetURI($scope.name, $scope.infohash, $scope.trackers);
    $scope.trackers.push({ v: "" });
    $scope.parse();
  };

  $scope.submitOmni = function() {
    if($scope.mode.search) {
      $scope.submitSearch();
    } else {
      $scope.submitTorrent();
    }
  };

  $scope.submitTorrent = function() {
    if($scope.mode.torrent) {
      api.url($scope.inputs.omni);
    } else if($scope.mode.magnet) {
      api.magnet($scope.inputs.omni);
    } else {
      window.alert("UI Bug");
    }
  };

  $scope.submitSearch = function() {

    //lookup provider's origin
    var provider = $scope.data.SearchProviders[$scope.inputs.provider];
    if(!provider) return;
    var origin = /(https?:\/\/[^\/]+)/.test(provider.url) && RegExp.$1;

    search.all($scope.inputs.provider, $scope.inputs.omni, $scope.page).success(function(results) {
      if (results.length === 0) {
        $scope.noResults = true;
        $scope.hasMore = false;
        return;
      }
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        //add origin to absolute urls
        if(r.url && /^\//.test(r.url)) {
          r.url = origin + r.url;
        }
        $scope.results.push(r);
      }
      $scope.page++;
    });

  };

  $scope.submitSearchItem = function(result) {
    //if search item has magnet, download now!
    if (result.magnet) {
      api.magnet(result.magnet);
      return;
    }
    //else, look it up via url
    if (!result.path)
      return $scope.omnierr = "No URL found";

    search.one($scope.inputs.provider, result.path).success(function(err, data) {
      if (err)
        return $scope.omnierr = err;

      var magnet;

      if (data.magnet) {
        magnet = data.magnet;
      } else if (data.infohash) {
        magnet = magnetURI(result.name, data.infohash, [{v: data.tracker }]);
      } else {
        $scope.omnierr = "No magnet or infohash found";
        return;
      }

      api.magnet(magnet);
    });
  };
});