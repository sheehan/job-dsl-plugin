(function($) {

    var DslLoader = function() {
        this.dslsByUrl = {};
    };
    _.extend(DslLoader.prototype, {

        fetch: function(url) {
            var dsl = this.dslsByUrl[url];
            if (!dsl) {
                return $.get(url).then(function(data) {
                    _.forEach(data.contexts, function(context) { this.processContext(context); }, this);
                    this.dslsByUrl[url] = data;
                    return data;
                }.bind(this));
            }
            return $.Deferred().resolveWith(null, [dsl]);
        },

        processContext: function(context) {
            var tokens = context.type.split('.');
            var simpleClassName = tokens[tokens.length - 1];
            context.simpleClassName = simpleClassName;

            context.methods.forEach(function(method) {
                if (method.signatures.every(function(sig) { return sig.deprecated; })) {
                    method.deprecated = true;
                }

                if (method.plugin) {
                    method.plugin = window.updateCenter.data.plugins[method.plugin];
                }
            });
        }
    });

    var App = function() {
        this.dslLoader = new DslLoader();

        this.initLayout();
        this.loadSelectedDsl();

        $('.version-select').change(this.loadSelectedDsl.bind(this));

        window.addEventListener('hashchange', this.onHashChange.bind(this), false);
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

                    if (type === 'path') {
                        this.showPathDetail(value);
                    } else if (type === 'method') {
                        var methodIndex = value.lastIndexOf('.');
                        var contextClass = value.substr(0, methodIndex);
                        var methodName = value.substr(methodIndex + 1);
                        this.showMethodDetail(contextClass, methodName);
                    } else if (type === 'plugin') {
                        var plugin = _.find(this.plugins, function(plugin) { return plugin.title === value; });
                        this.showPluginDetail(plugin);
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

        onDslFetchComplete: function(data) {
            this.data = data;
            this.plugins = this.getPluginList(data);
            this.initTree(data);

            var allItems = [];
            _.forEach(this.data.contexts, function(context, clazz) {
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
                    name: plugin.title
                };
            }));
            allItems = _.sortBy(allItems, function(item) { return item.name.toLowerCase(); });

            $('.search-input').keyup(function() {
                var val = $('.search-input').val();
                if (val) {
                    if ($('.tree-body').is(':visible')) {
                        $('.tree-body').hide();
                        $('.search-results').show();
                    }

                    var matches = allItems.filter(function(item) {
                        return item.name.toLowerCase().indexOf(val) !== -1;
                    }, this);
                    var html = Handlebars.templates['searchResults']({results: matches});
                    $('.search-results').html(html);
                    // update result list
                } else {
                    $('.tree-body').show();
                    $('.search-results').hide();
                }
            }.bind(this));


            this.updateDetailFromHash();
        },

        initLayout: function() {
            this.layout = $('.layout-container').layout({
                west__paneSelector: '.tree',
                west__contentSelector: '.tree-wrapper',
                west__size: 360,
                west__minSize: 360,
                west__spacing_open: 3,
                west__resizerCursor: 'ew-resize',
                center__paneSelector: '.detail-wrapper',
                north__size: 50,
                resizable: true,
                closable: false
            });
        },

        getPluginList: function(data) {
            var plugins = [];

            _.forEach(data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin) {
                        plugins.push(method.plugin);
                    }
                });
            });

            plugins = _.uniq(plugins);
            return _.sortBy(plugins, 'name');
        },

        initTree: function(data) {
            var $treeBody = $('.tree-body');

            $treeBody
                .jstree('destroy')
                .on('changed.jstree', this.onTreeChanged.bind(this))
                .on('ready.jstree', function() {
                    this.updateTreeFromHash();
                    var selectedNodes = this.jstree.get_selected(true);
                    if (selectedNodes.length) {
                        $('#' + selectedNodes[0].id)[0].scrollIntoView();
                    }
                }.bind(this))
                .jstree({
                    'plugins': ['wholerow'],
                    'core': {
                        'data': function(node, cb) {
                            var contextClass = node.id === '#' ? data.root.contextClass : node.original.methodNode.contextClass;
                            var methods = data.contexts[contextClass].methods;
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
            var methodNode = data.node.original.methodNode;

            window.location.hash = 'path/' + data.node.id;
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
                    }
                }, this);
            }
        },

        showPluginDetail: function(plugin) {

            var usages = [];
            _.forEach(this.data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin === plugin) {
                        usages.push({method: method, context: context});
                    }
                });
            });

            var html = Handlebars.templates['pluginDetail']({plugin: plugin, usages: usages});
            $('.detail-wrapper').html(html);
        },

        showMethodDetail: function(contextClass, methodName) {
            var methodNode = _.find(this.data.contexts[contextClass].methods, function(method) { return method.name === methodName; });
            var data = {
                methodNode: methodNode,
                name: methodNode.name
            };
            if (methodNode.contextClass) {
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods.map(function(method) {
                    var href = '#method/' + methodNode.contextClass + '.' + method.name;
                    return {
                        href: href,
                        method: method
                    }
                });
            }

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
            data.usages = _.sortBy(usages, function(usage) { return (usage.method.name + usage.simpleClassName).toLowerCase(); });

            var html = Handlebars.templates['detail'](data);
            $('.detail-wrapper').html(html);

            $('pre.highlight')
                .add('.method-doc pre code')
                .each(function(i, block) { hljs.highlightBlock(block); });

            $('.method-doc pre').addClass('highlight');
        },

        showPathDetail: function(path) {
            var node = this.data.contexts[this.data.root.contextClass];
            var methodNode;
            var ancestors = [];
            if (path) {
                var tokens = path.split('-');
                tokens.forEach(function(token, index) {
                    var id = tokens.slice(0, index + 1).join('-');
                    methodNode = _.find(node.methods, function(method) { return method.name === token; });
                    node = this.data.contexts[methodNode.contextClass];
                    if (index < tokens.length - 1) {
                        ancestors.push({
                            id: id,
                            text: token
                        });
                    }
                }, this);
            } else {
                methodNode = this.data.root;
            }
            var data = {
                methodNode: methodNode,
                name: methodNode.name,
                ancestors: ancestors,
                isRoot: !path
            };
            if (methodNode.contextClass) {
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods.map(function(method) {
                    var href = '#path/' + (path ? path + '-' : '') + method.name;
                    return {
                        href: href,
                        method: method
                    }
                });
            }
            var html = Handlebars.templates['detail'](data);
            $('.detail-wrapper').html(html);

            $('pre.highlight')
                .add('.method-doc pre code')
                .each(function(i, block) {
                    hljs.highlightBlock(block);
                });
            $('.method-doc pre').addClass('highlight');
        },

        getTreeNodeAncestors: function(node) {
            var parentNodes = node.parents.map(function(parentId) { return this.jstree.get_node(parentId); }, this).reverse();
            return parentNodes.filter(function(parentNode) { return parentNode.text; });
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
this["Handlebars"]["templates"]["detail"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "        <ol class=\"breadcrumb\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.ancestors : depth0), {"name":"each","hash":{},"fn":this.program(2, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            <li class=\"active\">"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "</li>\n        </ol>\n";
},"2":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <li><a href=\"#"
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
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.availableSince : depth0), {"name":"if","hash":{},"fn":this.program(7, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecatedSince : depth0), {"name":"if","hash":{},"fn":this.program(9, data),"inverse":this.program(11, data),"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "                <pre class=\"highlight groovy\">"
    + escapeExpression(((helper = (helper = helpers.text || (depth0 != null ? depth0.text : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"text","hash":{},"data":data}) : helper)))
    + "</pre>\n";
},"7":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                    <span class=\"label label-info\">Available since "
    + escapeExpression(((helper = (helper = helpers.availableSince || (depth0 != null ? depth0.availableSince : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"availableSince","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"9":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                    <span class=\"label label-warning\">Deprecated since "
    + escapeExpression(((helper = (helper = helpers.deprecatedSince || (depth0 != null ? depth0.deprecatedSince : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"deprecatedSince","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"11":function(depth0,helpers,partials,data) {
  var stack1, buffer = "";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(12, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer;
},"12":function(depth0,helpers,partials,data) {
  return "                        <span class=\"label label-warning\">Deprecated</span>\n";
  },"14":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, buffer = "            <div class=\"method-doc\">";
  stack1 = lambda(((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.html : stack1), depth0);
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</div>\n";
},"16":function(depth0,helpers,partials,data) {
  var stack1, buffer = "            <h3>Context Methods</h3>\n            <div class=\"context-methods-section ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.isRoot : depth0), {"name":"if","hash":{},"fn":this.program(17, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\">\n";
  stack1 = helpers.unless.call(depth0, (depth0 != null ? depth0.isRoot : depth0), {"name":"unless","hash":{},"fn":this.program(19, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "                <ul class=\"context-methods\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.contextMethods : depth0), {"name":"each","hash":{},"fn":this.program(21, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "                </ul>\n";
  stack1 = helpers.unless.call(depth0, (depth0 != null ? depth0.isRoot : depth0), {"name":"unless","hash":{},"fn":this.program(26, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            </div>\n";
},"17":function(depth0,helpers,partials,data) {
  return "root";
  },"19":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <pre><code>"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + " {</code></pre>\n";
},"21":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, lambda=this.lambda, buffer = "                        <li>\n                            <div class=\"method-name ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.deprecated : stack1), {"name":"if","hash":{},"fn":this.program(22, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\">\n                                <span class=\"method-link-wrapper\">\n                                    <a href=\""
    + escapeExpression(((helper = (helper = helpers.href || (depth0 != null ? depth0.href : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"href","hash":{},"data":data}) : helper)))
    + "\" title=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "</a>\n                                </span>\n";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.firstSentenceCommentText : stack1), {"name":"if","hash":{},"fn":this.program(24, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "                            </div>\n                        </li>\n";
},"22":function(depth0,helpers,partials,data) {
  return "deprecated";
  },"24":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "                                    <span class=\"firstSentenceCommentText\">\n                                    // "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.firstSentenceCommentText : stack1), depth0))
    + "\n                                    </span>\n";
},"26":function(depth0,helpers,partials,data) {
  return "                <pre><code>}</code></pre>\n";
  },"28":function(depth0,helpers,partials,data) {
  var stack1, buffer = "            <h3>Usages</h3>\n            <ul class=\"usages list-group\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"each","hash":{},"fn":this.program(29, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            </ul>\n";
},"29":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression, buffer = "                    <li class=\"list-group-item\">\n                        <div class=\"method-name ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.deprecated : stack1), {"name":"if","hash":{},"fn":this.program(22, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\">\n                            <a href=\"#method/"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.type : stack1), depth0))
    + "."
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\" title=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.name : stack1), depth0))
    + "</a>\n                            : "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.simpleClassName : stack1), depth0))
    + "\n                        </div>\n                    </li>\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "<div class=\"detail\">\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.ancestors : depth0), {"name":"if","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "    <div class=\"method-detail\">\n        <h2>\n            "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\n            ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.plugin : stack1), {"name":"if","hash":{},"fn":this.program(4, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "</h2>\n        <div class=\"signatures\">\n";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.signatures : stack1), {"name":"each","hash":{},"fn":this.program(6, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "        </div>\n\n";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.html : stack1), {"name":"if","hash":{},"fn":this.program(14, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.contextMethods : depth0), {"name":"if","hash":{},"fn":this.program(16, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"if","hash":{},"fn":this.program(28, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "    </div>\n</div>";
},"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["pluginDetail"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression, buffer = "                <tr>\n                    <td class=\"method-name ";
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
    + "</a>\n                        : "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.simpleClassName : stack1), depth0))
    + "\n                    </td>\n                    <td class=\"method-comment\" title=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.firstSentenceCommentText : stack1), depth0))
    + "\">"
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.method : depth0)) != null ? stack1.firstSentenceCommentText : stack1), depth0))
    + "</td>\n                </tr>\n";
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
  buffer += "</div>\n\n        <h3>DSL Methods</h3>\n        <table class=\"table table-condensed methods\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.usages : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "        </table>\n    </div>\n</div>";
},"useData":true});
this["Handlebars"] = this["Handlebars"] || {};
this["Handlebars"]["templates"] = this["Handlebars"]["templates"] || {};
this["Handlebars"]["templates"]["plugins"] = Handlebars.template({"1":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "        <option value=\""
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\">"
    + escapeExpression(((helper = (helper = helpers.title || (depth0 != null ? depth0.title : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"title","hash":{},"data":data}) : helper)))
    + "</option>\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<label>Filter by plugin</label>\n<select class=\"plugin-select form-control\">\n    <option value=\"\">Select</option>\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.plugins : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</select>";
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
    + "\">\n                    <div>\n                        <span class=\"method label\">M</span>\n                        "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + " :\n                        <span class=\"simpleClassName\">"
    + escapeExpression(((helper = (helper = helpers.simpleClassName || (depth0 != null ? depth0.simpleClassName : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"simpleClassName","hash":{},"data":data}) : helper)))
    + "</span>\n                    </div>\n                </a>\n";
},"4":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                <a href=\"#plugin/"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\">\n                    <span class=\"plugin label\">P</span>\n                    "
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\n                </a>\n";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<ul>\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.results : depth0), {"name":"each","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</ul>";
},"useData":true});