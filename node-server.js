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

var fs = require('fs');
var http = require('http');

var SITE_ROOT = '/';
var DEFAULT_DIRECTORY = "Home";
var DEFAULT_ARTICLE = "Welcome";
var CONTENT_DIR = "content";
var IMAGES_DIR = "images";
var TEMPLATE_FILE = "template.html";
var MAX_URL_LENGTH = 128;

function getContentTree(dir, done) {
	var tree = {};
	fs.readdir(dir, function(err, categs) {
		if (err) {
			return done(err); 
		}
		var pending = categs.length;
		categs.forEach(function(cat) {
			if (cat[0] < '0' || cat[0] > '9') {
				--pending;
			} else {
				var catPath = dir + "/" + cat;
				fs.stat(catPath, function(err, stat) {
					if (err) {
						return done(err);
					}
					if (stat.isDirectory()) {
						fs.readdir(catPath, function(err, arts) {
							if (err) {
								return done(err);
							}
							// remove all categories that do not begin
							// with numeric character (additional directories and 
							// hidden articles)
							var realArts = [];
							arts.forEach(function(art) {
								if (art[0] < '0' || art[0] > '9') {
									arts.splice(arts.indexOf(art), 1);
								}
							});
								
							tree[cat] = arts;
							--pending;
							if (pending === 0) {
								return done(null, tree);
							}
						});
					}
				});
			}
		});
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

function getArticle(selected) {
	return fs.readFileSync(CONTENT_DIR + '/' + selected.directory + '/' + selected.file, 'utf8');
}

function getTemplate() {
	return fs.readFileSync(TEMPLATE_FILE, 'utf8');
}

function getStyleSheetUrl() {
	return SITE_ROOT + 'style.css';	
}

function readStyleSheet() {
	return fs.readFileSync('style.css', 'utf8');
}

function readImage(contentDir, url) {
	return fs.readFileSync(url.substr(1));
}

http.createServer(function handler(req, res) {
	var url = req.url;
	// security first - sanitize URL
	if (url.length > MAX_URL_LENGTH) {
		url = '/';
	}
	url = url.replace(new RegExp('\\.\\.', 'g'), '');
	url = url.replace(new RegExp('[^0-9A-Za-z_./-]', 'g'), '');
	console.log(url);
	
	if (url === getStyleSheetUrl()) {
		var css = readStyleSheet();
	    res.writeHead(200, {'Content-Type': 'text/css'});
	    res.write(css);
	    res.end();
	} else if (url.includes('image')) {
		var img = readImage(CONTENT_DIR, url);
	    res.writeHead(200, {'Content-Type': 'image/png'});
		res.end(img, 'binary');
	} else {
	    res.writeHead(200, {'Content-Type': 'text/html'});
	    getContentTree(CONTENT_DIR, function(err, tree) {
	    	if (err) {
	    		console.error(err);
	    	} else {
	    		var template = getTemplate();
		        var selected = findArticle(url, tree);
		        var text = getArticle(selected);
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
		        res.write(result + '\n');
		        res.end();
	    	}
	    });
	}
}).listen(1337, '0.0.0.0');
console.log('Server running at http://127.0.0.1:1337/');
