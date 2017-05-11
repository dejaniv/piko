/*
 This file is part of Piko Template Engine.

    Piko Template Engine is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Piko Template Engine is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with Piko Template Engine.  If not, see <http://www.gnu.org/licenses/>.

    Author: Dejan Ivkovic
*/

'use strict';

var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var http = require('http');

const SITE_ROOT = '/';
const DEFAULT_DIRECTORY = "Home";
const DEFAULT_ARTICLE = "Welcome";
const CONTENT_DIR = "content";
const IMAGES_DIR = "images";
const TEMPLATE_FILE = "template.html";
const MAX_URL_LENGTH = 128;
const CONTENT_BUCKET = "sharpcrafts.com"

function getContentTree(dir, done) {
    var tree = {};
    (function listAllKeys(marker, cb)
    {
      s3.listObjects({Bucket: CONTENT_BUCKET, Marker: marker}, function(err, data){
        for (var i in data.Contents) {
            var key = data.Contents[i].Key;
            if (key.lastIndexOf(CONTENT_DIR + '/') === 0) {
                key = key.substr(CONTENT_DIR.length + 1);
                if (key[0] >= '0' && key[0] <= '9' && key.lastIndexOf('/') !== key.length - 1) {
                    var parts = key.split('/');
                    if (parts.length == 2) {
                        var category = parts[0];
                        var article = parts[1];
                        if (article[0] >= '0' && article[0] <= '9' && article.lastIndexOf('/') !== article.length - 1) {
                            if (tree[category]) {
                                tree[category].push(article);
                            } else {
                                tree[category] = [ article ];
                            }
                        }
                    }
                }
            }
        }
    
        if(data.IsTruncated)
          listAllKeys(data.NextMarker, cb);
        else
          cb();
      });
    })(null, function() {
        done(null, tree);
    });
}

function findArticle(path, contentTree) {
	
	var directory = DEFAULT_DIRECTORY;
	var file = DEFAULT_ARTICLE;
	
	var subPaths = path.split('/');
	if (subPaths.length === 3 && subPaths[2].length === 0) {
		subPaths.splice(2, 1);
	}
	if (subPaths[0].length === 0) {
		subPaths.splice(0, 1);
	}

	if (subPaths.length === 2) {

		var category = subPaths[0];
		var article = subPaths[1];
		
		// find directory
		var found = false;
		for (var dir in contentTree) {
			if (dir.substr(3) === category) {
				directory = dir;
				found = true;
				break;
			}
		}
		if (found) {
			found = false;
			contentTree[dir].forEach(function(art) {
				if (art.substr(3) === article) {
					file = art;
					found = true;
					return true;
				}
			});
		}
		if (!found) {
			directory = DEFAULT_DIRECTORY;
			file = DEFAULT_ARTICLE;
		}
	}
	return { 'directory' : directory, 'file' : file };
}


function generateMenu(artTree, selected)
{
	var menu = '';
	menu += '<div class="menu">\n';
	menu += '<a href="' + SITE_ROOT + '" class="menu">';
	if (selected.directory === DEFAULT_DIRECTORY &&
		selected.file === DEFAULT_ARTICLE) {
			menu += '<p class="menu" id="homeSelected">';
		} else {
		   menu += '<p class="menu" id="home">';
		}
	menu += 'Home</p></a></div>\n';

	var keys = [];
	for (var key in artTree) {
		keys.push(key);
	}
	keys.sort(function(a, b) {
		var result = 0;
		if (a < b) {
			result = -1;
		} else if (a > b) {
			result = 1;
		}
		return result;
	});
		
	for (var j = 0; j < keys.length; j++)
	{
		var catDir = keys[j];
		var category = catDir.substr(3);
		menu += '<div class="menu">\n';
		menu += '<p class="menu">' + category.replace(new RegExp('_', 'g'), ' ') + '</p>\n';
		// make list of articles
		menu += '<ul class="menu">\n';
		var files = artTree[catDir];
		for (var i = 0; i < files.length; i++) {
			var article = files[i].substr(3);
			if (catDir === selected.directory && files[i] === selected.file) {  
				menu += '<li class="menu" id="selected">';
			} else {
				menu += '<li class="menu">';
			}
			menu += '<a class="menu" href="'; 
			menu += SITE_ROOT + category + '/' + article + '"> ';
			menu += '<p>';
			menu += article.replace(new RegExp('_', 'g'), ' ');
			menu += '</p>';
			menu += '</a></li>\n';
		}
		menu += '</ul>\n';
		menu += '</div>\n';
	}
	return menu;
}

function replaceTag(text, tag, replTag, replClosingTag)
{
	var pos;
	do {
		var searchTag = '{' + tag;
		pos = text.indexOf(searchTag); 
		if (pos !== -1)
		{
			var paramPos = pos + tag.length + 1;
			var endPos = text.indexOf('}', paramPos);
			var replTagResolved = replTag;
			//check if tag has parameter
			if (text[paramPos] === ':') {
				var param = text.substr(paramPos + 1, endPos - paramPos - 1);
				replTagResolved = replTag.replace(new RegExp('\\$param', 'g'), param);
				searchTag = searchTag + ':' + param;
			}
			searchTag = searchTag + '}';
			text = text.replace(searchTag, replTagResolved);
		}
  } while(pos !== -1);

  if (replClosingTag.length > 0) {
    text = text.replace(new RegExp('{/' + tag + '}', 'g'), replClosingTag);
  }

  return text;
}

function formatArticle(text, catDir)
{
  text = replaceTag(text, 'headline', '<h1 class="content"><a name="$param">', '</a></h1>');
  text = replaceTag(text, 'image', '<div class="imgcontainer"><a href="' + SITE_ROOT + CONTENT_DIR + '/$param"><img src="' + SITE_ROOT + CONTENT_DIR + '/$param"/></a></div>', '');
  text = replaceTag(text, 'p', '<p class="content">', '</p>');
  text = replaceTag(text, 'en', '<ul class="content"><li>', '</li></ul>');
  text = replaceTag(text, '*', '</li><li>', '');
  text = replaceTag(text, 'link', '<a class="content" href="$param">', '</a>');
  text = replaceTag(text, 'b', '<strong>', '</strong>');
  text = replaceTag(text, 'code', '<div class="codecontainer"><code class="content">', '</code></div>');
  text = replaceTag(text, 'figure', '<p class="content figure">$param</p>', '');

  return text;
}

function getArticle(selected, callback) {
    s3.getObject({Bucket: CONTENT_BUCKET, Key: CONTENT_DIR + '/' + selected.directory + '/' + selected.file }, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.Body.toString('utf8'));
        }
    });
}

function getTemplate(callback) {
    s3.getObject({Bucket: CONTENT_BUCKET, Key: 'template.html'}, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.Body.toString('utf8'));
        }
    });
}

function getStyleSheetUrl() {
	return SITE_ROOT + 'style.css';	
}

function readStyleSheet(callback) {
    s3.getObject({Bucket: CONTENT_BUCKET, Key: 'style.css'}, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.Body.toString('utf8'));
        }
    });
}

function readImage(contentDir, url, callback) {
    s3.getObject({Bucket: CONTENT_BUCKET, Key: url.substr(1)}, function(err, data) {
        if (err) {
            callback(err);
        } else {
            callback(err, data.Body);
        }
    });
}

function handleReq(reqUrl, callback) {
	var url = reqUrl;
	var res = {};
	// security first - sanitize URL
	if (url.length > MAX_URL_LENGTH) {
		url = '/';
	}
	url = url.replace(new RegExp('\\.\\.', 'g'), '');
	url = url.replace(new RegExp('[^0-9A-Za-z_./-]', 'g'), '');
	console.log(url);
	
	if (url === getStyleSheetUrl()) {
		readStyleSheet(function (err, data) {
		    if (err) {
	    	    callback(err);
		    } else {
        		res.statusCode = 200;
        	    res.headers = { 'Content-Type' : 'text/css' };
        	    res.body = data;
	    	    callback(null, res);
		    }
    	});
	} else if (url.includes('image')) {
		readImage(CONTENT_DIR, url, function(err, buffer) {
            if (err) {
	    	    callback(err);
		    } else {
            	res.statusCode = 200;
        	    res.headers = { 'Content-Type' : 'image/png'};
        	    res.body = buffer.toString('base64');
        	    res.isBase64Encoded = true;
        	    callback(null, res);
		    }
		});
	} else {
	    res.statusCode = 200;
	    res.headers = { 'Content-Type': 'text/html' };
	    getContentTree(CONTENT_DIR, function(err, tree) {
	    	if (err) {
	    		callback(err);
	    	} else {
	    		getTemplate(function(err, template) {
	    		    if (err) {
        	    	    callback(err);
	    		    } else {
        		        var selected = findArticle(url, tree);
        		        getArticle(selected, function(err, text) {
        		            if (err) {
        		                callback(err)
        		            } else {
                		        text = formatArticle(text, selected.directory);
                		        var menu = generateMenu(tree, selected);
                		        var stylesheet = getStyleSheetUrl();
                		        var result = template.replace('$text', text);
                		        result = result.replace("$menu", menu);
                		        result = result.replace("$stylesheet", stylesheet);
                		        var title = selected.file;
                		        if (title[0] >= '0' && title[0] <= '1') {
                		            title = title.substr(3);
                		        }
                		        result = result.replace("$title", title.replace(new RegExp('_', 'g'), ' '));
                		        res.body = result + '\n';
                        	    callback(null, res);
        		            }
        		        });
	    		    }
	    		});
	    	}
	    });
	}
}

exports.handler = (event, context, callback) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? 'Error: ' + err.message : res,
        headers: {
            'Content-Type': 'text/html',
        },
    });

    switch (event.httpMethod) {
        case 'GET':
            handleReq(event.path, callback);
            break;
        default:
            done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
};
