(function($) {

    /**
     * Loads and caches DSL data.
     */
    var DslLoader = function() {
        this.dslsByUrl = {};
    };
    _.extend(DslLoader.prototype, {

        fetch: function(url) {
            var dsl = this.dslsByUrl[url];
            if (!dsl) {
                return $.get(url).then(function(data) {
                    var dsl = new Dsl(data);
                    this.dslsByUrl[url] = dsl;
                    return dsl;
                }.bind(this));
            }
            return $.Deferred().resolveWith(null, [dsl]);
        }
    });

    /**
     * Provides access to DSL data.
     */
    var Dsl = function(data) {
        this.data = data;
        _.forEach(data.contexts, this._processContext.bind(this));
    };
    _.extend(Dsl.prototype, {

        _processContext: function(context) {
            var tokens = context.type.split('.');
            context.simpleClassName = tokens[tokens.length - 1];

            context.methods.forEach(function(method) {
                if (method.signatures.every(function(sig) { return sig.deprecated; })) {
                    method.deprecated = true;
                }

                var signatureWithContext = _.find(method.signatures, function(signature) { return signature.contextClass && !signature.deprecated; });
                if (!signatureWithContext) {
                    signatureWithContext = _.find(method.signatures, function(signature) { return signature.contextClass; });
                }

                if (signatureWithContext) {
                    method.contextClass = signatureWithContext.contextClass;
                }

                var signatureWithPlugin = _.find(method.signatures, function(signature) { return signature.plugin; });
                if (signatureWithPlugin) {
                    method.plugin = window.updateCenter.data.plugins[signatureWithPlugin.plugin.id];
                }
            });
        },

        getContext: function(contextClass) {
            return this.data.contexts[contextClass];
        },

        getRootContextClass: function() {
            return this.data.root.contextClass;
        },

        getPluginList: function() {
            var plugins = [];

            _.forEach(this.data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin) {
                        plugins.push(method.plugin);
                    }
                });
            });

            plugins = _.uniq(plugins);
            return _.sortBy(plugins, 'name')
        },

        findUsages: function(contextClass) {
            var usages = [];
            _.forEach(this.data.contexts, function(context, clazz) {
                context.methods.forEach(function(method) {
                    if (method.contextClass === contextClass) {
                        usages.push({
                            method: method,
                            context: context,
                            simpleClassName: context.simpleClassName
                        });
                    }
                });
            });
            return usages;
        },

        findPluginUsages: function(plugin) {
            var usages = [];
            _.forEach(this.data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin === plugin) {
                        usages.push({method: method, context: context});
                    }
                });
            });
            return usages;
        },

        findMethodNode: function(contextClass, tokens) {
            var methodNode = null;
            var contextNode = this.data.contexts[contextClass];

            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                methodNode = _.findWhere(contextNode.methods, {name: token});

                if (i < tokens.length - 1) {
                    contextNode = this.getContext(methodNode.contextClass);
                    // TODO this is a hack to make sure we get the right context (for copyArtifacts). it only checks one level though.
                    // should be a depth-first search or something
                    var nextToken = tokens[i + 1];
                    var matchingSig = _.find(methodNode.signatures, function(signature) {
                        var match = false;
                        var sigContextClass = signature.contextClass;
                        if (sigContextClass) {
                            var sigContext = this.getContext(sigContextClass);
                            match = !!_.findWhere(sigContext.methods, {name: nextToken});
                        }
                        return match;
                    }, this);
                    contextNode = this.getContext(matchingSig.contextClass);
                }
            }

            return methodNode;
        },

        findAncestors: function(contextClass, tokens) {
            var ancestors = [];

            tokens.forEach(function(token, index) {
                if (index < tokens.length - 1) {
                    var id = tokens.slice(0, index + 1).join('-');
                    ancestors.push({
                        id: id,
                        text: token
                    });
                }
            }, this);

            return ancestors;
        },

        getContextSignatures: function(contextClass, path) {
            var signatures = [];

            this.data.contexts[contextClass].methods.forEach(function(method) {
                var methodPath = (path ? path + '-' : '') + method.name;
                Array.prototype.push.apply(signatures, this.getSignatures(method, methodPath));
            }, this);

            return signatures;
        },

        getSignatures: function(method, path) {
            var href = '#path/' + (path ? path + '-' : '') + method.name;
            return method.signatures.map(function(signature, index) {

                if (signature.contextClass) {
                    signature.context = this.data.contexts[signature.contextClass];
                }

                var params = signature.parameters;
                if (signature.context) {
                    params = params.slice(0, params.length - 1);
                }
                var paramTokens = params.map(function(param) {
                    var token = param.type + ' ' + param.name;
                    if (param.defaultValue) {
                        token += ' = ' + param.defaultValue;
                    }
                    return token;
                });
                var text = paramTokens.join(', ');
                if (paramTokens.length || !signature.context) {
                    text = '(' + text + ')';
                }

                var data = {
                    name: method.name,
                    href: href,
                    path: path,
                    index: index,
                    availableSince: signature.availableSince,
                    deprecated: signature.deprecated,
                    text: text,
                    html: signature.html,
                    context: signature.context,
                    comment: signature.firstSentenceCommentText
                };

                var enums = _.chain(signature.parameters)
                    .filter(function(parameter) { return parameter.enumConstants; })
                    .map(function(parameter) {
                        var typeTokens = parameter.type.split('.');
                        var simpleName = typeTokens[typeTokens.length - 1];
                        return {
                            paramName: parameter.name,
                            values: parameter.enumConstants.map(function(v) { return simpleName + '.' + v; })
                        };
                    })
                    .value();

                if (enums.length) {
                    data.enums = enums;
                }

                if (signature.plugin) {
                    data.plugin = signature.plugin;
                    var pluginData = window.updateCenter.data.plugins[signature.plugin.id];
                    if (pluginData) {
                        data.plugin.title = pluginData.title;
                    } else {
                        console.log('plugin not found', signature.plugin.id);
                    }
                }

                return data;
            }, this)
        },

        getPathInfo: function(path) {
            var methodNode;
            var ancestors = [];
            var usages = [];
            if (path) {
                var tokens = path.split('-');

                var contextClass;
                var pathTokens;
                var methodIndex = tokens[0].lastIndexOf('.');
                if (methodIndex === -1) { // absolute
                    contextClass = this.data.root.contextClass;
                    pathTokens = tokens;
                } else { // relative
                    var methodName = tokens[0].substr(methodIndex + 1);

                    contextClass = tokens[0].substr(0, methodIndex);
                    pathTokens = [methodName].concat(tokens.slice(1));
                    usages = this.findUsages(contextClass);
                }

                methodNode = this.findMethodNode(contextClass, pathTokens);
                ancestors = this.findAncestors(contextClass, pathTokens);

                if (ancestors.length && methodIndex !== -1) {
                    ancestors[0].id = contextClass + '.' + ancestors[0].id;
                }
            } else {
                methodNode = this.data.root;
            }

            return {
                methodNode: methodNode,
                ancestors: ancestors,
                usages: usages
            };
        },

        getAllContexts: function() {
            return this.data.contexts;
        }
    });

    var App = function() {
        this.dslLoader = new DslLoader();

        this.initLayout();
        this.loadSelectedDsl();

        $('.version-select').change(this.loadSelectedDsl.bind(this));

        window.addEventListener('hashchange', this.onHashChange.bind(this), false);

        $('.search-input').keyup(this.onSearch.bind(this));
        $('.clear-search').click(function(event) {
            event.preventDefault();
            $('.search-input').val('');
            this.onSearch();
        }.bind(this));
    };

    _.extend(App.prototype, {

        onHashChange: function(e) {
            e.preventDefault();
            e.stopPropagation();

            this.updateDetailFromHash();
            this.updateTreeFromHash();
        },

        updateDetailFromHash: function() {
            var hashId = window.location.hash;
            if (hashId) {
                hashId = hashId.substring(1);
                var index = hashId.indexOf('/');
                if (index !== -1) {
                    var type = hashId.substr(0, index);
                    var value = hashId.substr(index + 1);

                    if (type === 'plugin') {
                        var plugin = _.find(this.plugins, function(plugin) { return plugin.name === value; });
                        this.showPluginDetail(plugin);
                    } else {
                        this.showPathDetail(value);
                    }
                }
            } else {
                this.showPathDetail();
            }
            this.layout.resizeAll();
        },

        loadSelectedDsl: function() {
            var url = $('.version-select').val();
            this.dslLoader.fetch(url).then(this.onDslFetchComplete.bind(this));
        },

        onDslFetchComplete: function(dsl) {
            this.dsl = dsl;
            this.plugins = this.dsl.getPluginList();
            this.initTree();

            var allItems = [];
            _.forEach(this.dsl.getAllContexts(), function(context, clazz) {
                context.methods.forEach(function(method) {
                    allItems.push({
                        name: method.name,
                        clazz: clazz,
                        simpleClassName: context.simpleClassName
                    });
                });
            });

            allItems = allItems.concat(this.plugins.map(function(plugin) {
                return {
                    id: plugin.name,
                    name: plugin.title
                };
            }));
            allItems = _.sortBy(allItems, function(item) { return item.name.toLowerCase(); });
            this.allItems = allItems;

            this.updateDetailFromHash();
        },

        onSearch: function() {
            var val = $('.search-input').val();
            $('.clear-search').toggleClass('hide', !val);
            var $treeBody = $('.tree-body');
            var $searchResults = $('.search-results');
            if (val) {
                if ($treeBody.is(':visible')) {
                    $treeBody.hide();
                    $searchResults.show();
                }

                var matches = this.allItems.filter(function(item) {
                    return item.name.toLowerCase().indexOf(val) !== -1; // TODO
                }, this);
                var html = Handlebars.templates['searchResults']({results: matches});
                $searchResults.html(html);
                // update result list
            } else {
                $treeBody.show();
                $searchResults.hide();
            }
        },

        initLayout: function() {
            this.layout = $('.layout-container').layout({
                north__paneSelector: '.title',
                north__spacing_open: 0,
                west__paneSelector: '.tree',
                west__contentSelector: '.tree-wrapper',
                west__size: 360,
                west__minSize: 360,
                west__spacing_open: 3,
                west__resizerCursor: 'ew-resize',
                center__paneSelector: '.detail-wrapper',
                north__size: 50,
                resizable: true,
                closable: false,
                enableCursorHotkey: false
            });
        },

        initTree: function() {
            var $treeBody = $('.tree-body');

            var updateNodes = function($el) {
                $el.parent().find('.jstree-open > i.jstree-icon')
                    .removeClass('glyphicon-triangle-right').addClass('glyphicon glyphicon-triangle-bottom');
                $el.parent().find('.jstree-closed > i.jstree-icon')
                    .removeClass('glyphicon-triangle-bottom').addClass('glyphicon glyphicon-triangle-right');
            };
            $treeBody.on('open_node.jstree', function(e, data){
                var el = document.getElementById(data.node.id);
                updateNodes($(el));
            });

            $treeBody.on('close_node.jstree', function(e, data){
                var el = document.getElementById(data.node.id);
                updateNodes($(el));
            });

            $treeBody
                .jstree('destroy')
                .on('changed.jstree', this.onTreeChanged.bind(this))
                .on('ready.jstree', function() {
                    this.updateTreeFromHash();
                    updateNodes($('.tree-body'));
                }.bind(this))
                .jstree({
                    'plugins': ['wholerow'],
                    'core': {
                        'animation': false,
                        'data': function(node, cb) {
                            var contextClass = node.id === '#' ? this.dsl.getRootContextClass() : node.original.methodNode.contextClass;
                            var methods = this.dsl.getContext(contextClass).methods;
                            var treeNodes = methods.map(function(method) {
                                return this.buildJstreeNode(method, node);
                            }, this);

                            cb(treeNodes);
                        }.bind(this),
                        'themes': {
                            'name': 'proton',
                            'responsive': true
                        },
                        'multiple': false,
                        'worker': false
                    }
                });
            this.jstree = $treeBody.jstree();
        },

        onTreeChanged: function(e, data) {
            e.preventDefault();
            var path = data.node.id;
            if (path.match('\\)$')) {
                var lastSignatureIndex = path.lastIndexOf('(');
                path = path.substring(0, lastSignatureIndex);
            }
            window.location.hash = 'path/' + path;
        },

        updateTreeFromHash: function() {
            var hashId = window.location.hash;
            this.jstree.deselect_all(true);

            if (hashId && hashId.indexOf('#path/') === 0) {
                $('.tree-body').show();
                $('.search-results').hide();

                var path = hashId.substring(6);
                var tokens = path.split('-');
                tokens.forEach(function(token, index) {
                    var id = tokens.slice(0, index + 1).join('-');
                    var node = this.jstree.get_node(id);
                    if (index < tokens.length - 1) {
                        this.jstree.open_node(node);
                    } else {
                        this.jstree.select_node(node.id);
                        var $el = $('#' + node.id);
                        if ($el.length) {
                            var $wrapper = $('.tree-wrapper');
                            if ($el.offset().top < $wrapper.offset().top ||
                                $el.offset().top + $el.height() > $wrapper.offset().top + $wrapper.height()) {
                                $el[0].scrollIntoView();
                            }
                        }
                    }
                }, this);
            }
        },

        showPluginDetail: function(plugin) {
            var usages = this.dsl.findPluginUsages(plugin);
            var html = Handlebars.templates['pluginDetail']({plugin: plugin, usages: usages});
            $('.detail-wrapper').html(html);
        },

        showPathDetail: function(path) {
            var pathInfo = this.dsl.getPathInfo(path);
            var methodNode = pathInfo.methodNode;
            var ancestors = pathInfo.ancestors;
            var usages = pathInfo.usages;

            var data = {
                methodNode: methodNode,
                name: methodNode.name,
                ancestors: ancestors
            };

            if (methodNode.signatures) {
                data.signatures = this.dsl.getSignatures(methodNode, path)
            }

            data.usages = _.sortBy(usages, function(usage) { return (usage.method.name + usage.simpleClassName).toLowerCase(); });

            var html,
                $detailWrapper = $('.detail-wrapper');
            if (path) {
                html = Handlebars.templates['detail'](data);
                $detailWrapper.html(html);
            } else {
                html = Handlebars.templates['root'](data);
                $detailWrapper.html(html);

                var signatures = this.dsl.getContextSignatures(methodNode.contextClass, path);

                var contextHtml = Handlebars.templates['context']({
                    signatures: signatures
                });
                $detailWrapper.find('.context-methods-section').html(contextHtml);
            }

            this.highlightCode($('.highlight'));

            $detailWrapper.find('.expand-closure').click(this.onExpandClick.bind(this));
        },

        onExpandClick: function(e) {
            e.preventDefault();
            var $el = $(e.currentTarget);
            var path = $el.data('path');
            var index = $el.data('index');

            $el.hide();

            var pathInfo = this.dsl.getPathInfo(path);
            var parentSignature = pathInfo.methodNode.signatures[index];
            var signatures = this.dsl.getContextSignatures(parentSignature.contextClass, path);
            var contextHtml = Handlebars.templates['context']({
                signatures: signatures
            });
            var $contextHtml = $(contextHtml);
            $contextHtml.insertAfter($el);

            this.highlightCode($contextHtml.find('.highlight'));

            $contextHtml.find('.expand-closure').click(this.onExpandClick.bind(this));
        },

        highlightCode: function($elements) {
            $elements.each(function(i, block) {
                hljs.highlightBlock(block);
                $(block).removeClass('ruby'); // TODO hljs bug?
            });
        },

        buildJstreeNode: function(node, parent) {
            var id = parent.id === '#' ? node.name : parent.id + '-' + node.name;
            var treeNode = {
                id: id,
                text: node.name,
                icon: false,
                methodNode: node,
                children: !!(node.contextClass)
            };

            if (node.deprecated) {
                treeNode.a_attr = {'class': 'deprecated'};
            }
            return treeNode;
        }
    });

    $(function() {
        new App();
    });
}(jQuery));
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["context"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "        <li>\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.comment : depth0), {"name":"if","hash":{},"fn":this.program(2, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "            <a href=\"#path/"
    + escapeExpression(((helper = (helper = helpers.path || (depth0 != null ? depth0.path : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"path","hash":{},"data":data}) : helper)))
    + "\">"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "</a><span class=\"highlight groovy inline\">"
    + escapeExpression(((helper = (helper = helpers.text || (depth0 != null ? depth0.text : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"text","hash":{},"data":data}) : helper)))
    + "</span>\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.context : depth0), {"name":"if","hash":{},"fn":this.program(5, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\n        </li>\n";
},"2":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "                <div class=\"firstSentenceCommentText\">\n                    // "
    + escapeExpression(((helper = (helper = helpers.comment || (depth0 != null ? depth0.comment : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"comment","hash":{},"data":data}) : helper)))
    + " ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(3, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\n                </div>\n";
},"3":function(depth0,helpers,partials,data) {
  return "Deprecated.";
  },"5":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "{<span class=\"expand-closure glyphicon glyphicon-option-horizontal\" data-path=\""
    + escapeExpression(((helper = (helper = helpers.path || (depth0 != null ? depth0.path : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"path","hash":{},"data":data}) : helper)))
    + "\" data-index=\""
    + escapeExpression(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"index","hash":{},"data":data}) : helper)))
    + "\"></span>}";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<ul class=\"inline-context-methods\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.signatures : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</ul>";
},"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["detail"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "        <ol class=\"breadcrumb\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.ancestors : depth0), {"name":"each","hash":{},"fn":this.program(2, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            <li class=\"active\">"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "</li>\n        </ol>\n";
},"2":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <li><a href=\"#path/"
    + escapeExpression(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"id","hash":{},"data":data}) : helper)))
    + "\">"
    + escapeExpression(((helper = (helper = helpers.text || (depth0 != null ? depth0.text : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"text","hash":{},"data":data}) : helper)))
    + "</a></li>\n";
},"4":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "<a href=\""
    + escapeExpression(lambda(((stack1 = ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.plugin : stack1)) != null ? stack1.wiki : stack1), depth0))
    + "\"><span class=\"glyphicon glyphicon-new-window\"></span> "
    + escapeExpression(lambda(((stack1 = ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.plugin : stack1)) != null ? stack1.title : stack1), depth0))
    + "</a>";
},"6":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "                ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.minimumVersion : stack1), {"name":"if","hash":{},"fn":this.program(7, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.availableSince : depth0), {"name":"if","hash":{},"fn":this.program(9, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(11, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "                <div class=\"signature\">\n                    "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "<span class=\"highlight groovy inline\">"
    + escapeExpression(((helper = (helper = helpers.text || (depth0 != null ? depth0.text : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"text","hash":{},"data":data}) : helper)))
    + "</span>\n                    ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.context : depth0), {"name":"if","hash":{},"fn":this.program(13, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n                </div>\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.html : depth0), {"name":"if","hash":{},"fn":this.program(15, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.enums : depth0), {"name":"if","hash":{},"fn":this.program(17, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer;
},"7":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "<span class=\"label label-min-version\">Requires "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.title : stack1), depth0))
    + " v"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.minimumVersion : stack1), depth0))
    + "+</span>";
},"9":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                    <span class=\"label label-since\">Since "
    + escapeExpression(((helper = (helper = helpers.availableSince || (depth0 != null ? depth0.availableSince : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"availableSince","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"11":function(depth0,helpers,partials,data) {
  return "                    <span class=\"label label-deprecated\">Deprecated</span>\n";
  },"13":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "{<span class=\"expand-closure glyphicon glyphicon-option-horizontal\" data-path=\""
    + escapeExpression(((helper = (helper = helpers.path || (depth0 != null ? depth0.path : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"path","hash":{},"data":data}) : helper)))
    + "\" data-index=\""
    + escapeExpression(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"index","hash":{},"data":data}) : helper)))
    + "\"></span>}";
},"15":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, buffer = "                    <div class=\"method-doc\">";
  stack1 = ((helper = (helper = helpers.html || (depth0 != null ? depth0.html : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"html","hash":{},"data":data}) : helper));
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</div>\n";
},"17":function(depth0,helpers,partials,data) {
  var stack1, buffer = "                    <div class=\"enums\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.enums : depth0), {"name":"each","hash":{},"fn":this.program(18, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "                    </div>\n";
},"18":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "                        <div class=\"enum\">\n                            <div class=\"enum-title\">Possible values for <code>"
    + escapeExpression(((helper = (helper = helpers.paramName || (depth0 != null ? depth0.paramName : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"paramName","hash":{},"data":data}) : helper)))
    + "</code>:</div>\n                            <ul>\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.values : depth0), {"name":"each","hash":{},"fn":this.program(19, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "                            </ul>\n                        </div>\n";
},"19":function(depth0,helpers,partials,data) {
  var lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "                                    <li>"
    + escapeExpression(lambda(depth0, depth0))
    + "</li>\n";
},"21":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "            <h3 class=\"section-header\">Examples</h3>\n\n            <pre class=\"highlight groovy\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.examples : stack1), depth0))
    + "</pre>\n";
},"23":function(depth0,helpers,partials,data) {
  var stack1, buffer = "            <h3 class=\"section-header\">Usages</h3>\n            <ul class=\"usages\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"each","hash":{},"fn":this.program(24, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            </ul>\n";
},"24":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression, buffer = "                    <li>\n                        <div class=\"method-name ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.deprecated : stack1), {"name":"if","hash":{},"fn":this.program(25, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\">\n                            <a href=\"#method/"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.type : stack1), depth0))
    + "."
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\" title=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "</a>\n                            : <span class=\"simple-class-name\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.simpleClassName : stack1), depth0))
    + "</span>\n                        </div>\n                    </li>\n";
},"25":function(depth0,helpers,partials,data) {
  return "deprecated";
  },"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "<div class=\"detail\">\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.ancestors : depth0), {"name":"if","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "    <div class=\"method-detail\">\n        <h2>\n            "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\n            ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.plugin : stack1), {"name":"if","hash":{},"fn":this.program(4, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n        </h2>\n        <div class=\"signatures\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.signatures : depth0), {"name":"each","hash":{},"fn":this.program(6, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "        </div>\n\n";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.examples : stack1), {"name":"if","hash":{},"fn":this.program(21, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"if","hash":{},"fn":this.program(23, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "    </div>\n</div>";
},"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["pluginDetail"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression, buffer = "                <li>\n                    <div class=\"method-name ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.deprecated : stack1), {"name":"if","hash":{},"fn":this.program(2, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\">\n                        <a href=\"#method/"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.type : stack1), depth0))
    + "."
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\" title=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "</a>\n                        : <span class=\"simple-class-name\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.simpleClassName : stack1), depth0))
    + "</span>\n                    </div>\n                </li>\n";
},"2":function(depth0,helpers,partials,data) {
  return "deprecated";
  },"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression, buffer = "<div class=\"detail\">\n    <div class=\"method-detail\">\n        <h2>\n            "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.title : stack1), depth0))
    + "\n\n            <a href=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.wiki : stack1), depth0))
    + "\"><span class=\"glyphicon glyphicon-new-window\"></span> Wiki</a></h2>\n        </h2>\n        <div class=\"method-doc\">";
  stack1 = lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.excerpt : stack1), depth0);
  if (stack1 != null) { buffer += stack1; }
  buffer += "</div>\n\n        <h3 class=\"section-header\">DSL Methods</h3>\n        <ul class=\"usages\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "        </ul>\n    </div>\n</div>";
},"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["root"] = Handlebars.template({"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  return "<div class=\"detail\">\n    <div class=\"method-detail\">\n        <h2>Jenkins Job DSL API</h2>\n\n        <div class=\"method-doc\">\n            <p>\n                Welcome to the Job DSL API Viewer. This is the Job DSL reference, showing all available DSL methods. Use the navigation\n                on the left to browse all methods starting from the methods available in the script context.\n            </p>\n            <p>\n                For further documentation, please go to the <a href=\"https://github.com/jenkinsci/job-dsl-plugin/wiki\">Job DSL Wiki</a>.\n            </p>\n        </div>\n\n        <h3 class=\"section-header\">Top-Level Methods</h3>\n        <div class=\"context-methods-section\"></div>\n    </div>\n</div>";
  },"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["searchResults"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, buffer = "        <li>\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.clazz : depth0), {"name":"if","hash":{},"fn":this.program(2, data),"inverse":this.program(4, data),"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "        </li>\n";
},"2":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <a href=\"#method/"
    + escapeExpression(((helper = (helper = helpers.clazz || (depth0 != null ? depth0.clazz : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"clazz","hash":{},"data":data}) : helper)))
    + "."
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\">\n                    <div>\n                        <span class=\"method label\" title=\"Method\">M</span>\n                        "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + " :\n                        <span class=\"simple-class-name\">"
    + escapeExpression(((helper = (helper = helpers.simpleClassName || (depth0 != null ? depth0.simpleClassName : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"simpleClassName","hash":{},"data":data}) : helper)))
    + "</span>\n                    </div>\n                </a>\n";
},"4":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <a href=\"#plugin/"
    + escapeExpression(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"id","hash":{},"data":data}) : helper)))
    + "\">\n                    <span class=\"plugin label\" title=\"Plugin\">P</span>\n                    "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\n                </a>\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<ul>\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.results : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</ul>";
},"useData":true});