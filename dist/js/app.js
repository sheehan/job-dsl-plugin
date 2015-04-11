(function($) {

    var DslLoader = function() {
        this.dslsByUrl = {};
    };
    _.extend(DslLoader.prototype, {

        fetch: function(url) {
            var dsl = this.dslsByUrl[url];
            if (!dsl) {
                return $.get(url).then(function(data) {
                    _.each(data.contexts, function(context) { this.processContext(context); }, this);
                    this.dslsByUrl[url] = data;
                    return data;
                }.bind(this));
            }
            return $.Deferred().resolveWith(null, [dsl]);
        },

        processContext: function(context) {
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

        $('body').on('change', '.plugin-select', function(e) {
            this.filterTree($(e.currentTarget).val());
        }.bind(this));

        window.addEventListener('hashchange', this.onHashChange.bind(this), false);
    };

    _.extend(App.prototype, {

        onHashChange: function(e) {
            e.preventDefault();
            e.stopPropagation();

            this.updateTreeFromHash();
        },

        loadSelectedDsl: function() {
            var url = $('.version-select').val();
            this.dslLoader.fetch(url).then(this.onDslFetchComplete.bind(this));
        },

        onDslFetchComplete: function(data) {
            this.data = data;
            this.initPluginSelect(data);
            this.initTree(data);
        },

        initLayout: function() {
            this.layout = $('.layout-container').layout({
                west__paneSelector: '.tree',
                west__contentSelector: '.tree-body',
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

        filterTree: function(pluginName) {
            this.pluginFilter = pluginName;
            this.initTree(this.data);
        },

        getPluginList: function(data) {
            var plugins = [];

            _.each(data.contexts, function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin) {
                        plugins.push(method.plugin);
                    }
                });
            });

            plugins = _.uniq(plugins);
            return _.sortBy(plugins, 'name');
        },

        initPluginSelect: function(data) {
            var html = Handlebars.templates['plugins']({plugins: this.getPluginList(data)});
            $('.plugins').html(html).hide();
        },

        initTree: function(data) {
            var $treeBody = $('.tree-body');

            $treeBody
                .jstree('destroy')
                .on('changed.jstree', this.onTreeChanged.bind(this))
                .on('ready.jstree', function() {
                    this.updateTreeFromHash();
                    if (this.pluginFilter) {
                        this.jstree.open_all();
                        var nodes = this.jstree.get_json(null, {flat: true});
                        this.jstree.deselect_all(true);
                        this.jstree.select_node(nodes[0].id);
                    }
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

            var hash = data.node.id.substr(5); // TODO
            //if (window.location.hash !== '#' + hash) {
                window.location.hash = hash;
                this.showMethodDetail(methodNode, data.node);

                this.layout.resizeAll();
            //}
        },

        updateTreeFromHash: function() {
            var hashId = window.location.hash;
            var node;
            if (hashId) {
                hashId = hashId.substring(1);

                var tokens = hashId.split('-');
                tokens.forEach(function(token, index) {
                    var id = tokens.slice(0, index + 1).join('-');
                    node = this.jstree.get_node('node-' + id);
                    if (index < tokens.length - 1) {
                        this.jstree.open_node(node);
                    }
                }, this);
            }

            if (node) {
                this.jstree.deselect_all(true);
                this.jstree.select_node(node.id);
            } else {
                this.jstree.deselect_all(true);
                this.showMethodDetail(this.data.root);
            }
        },

        showMethodDetail: function(methodNode, node) {
            var data = {methodNode: methodNode};
            data.name = methodNode.name;
            if (node) {
                var parentNodes = node.parents.map(function(parentId) { return this.jstree.get_node(parentId); }, this).reverse();
                data.ancestors = parentNodes.filter(function(parentNode) { return parentNode.text; });
            }
            if (methodNode.contextClass) {
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods;
            }
            var html = Handlebars.templates['detail'](data);
            $('.detail-wrapper').html(html);

            $('pre.highlight')
                .add('.method-doc pre code')
                .each(function(i, block) {
                    hljs.highlightBlock(block);
                });
        },

        buildJstreeNode: function(node, parent) {
            var id = parent.id === '#' ? 'node-' + node.name : parent.id + '-' + node.name;
            var treeNode = {
                id: id,
                text: node.name,
                icon: false,
                methodNode: node
            };

            if (node.deprecated) {
                treeNode.a_attr = {'class': 'deprecated'};
            }

            if (node.contextClass) {
                // TODO check for recursion
                var parentNodes = parent.parents.map(function(parentId) { return this.jstree.get_node(parentId); }, this);
                parentNodes.push(parent);

                var recursiveNode = _.find(parentNodes, function(parentNode) {
                    return parentNode.original && parentNode.original.methodNode.contextClass === node.contextClass;
                });

                treeNode.children = true;
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
  var stack1, lambda=this.lambda, buffer = "            <!--<h3>Description</h3>-->\n            <div class=\"method-doc\">";
  stack1 = lambda(((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.html : stack1), depth0);
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</div>\n";
},"16":function(depth0,helpers,partials,data) {
  var stack1, buffer = "            <h3>Context Methods</h3>\n            <table class=\"table table-condensed methods\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.contextMethods : depth0), {"name":"each","hash":{},"fn":this.program(17, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            </table>\n";
},"17":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "                    <tr>\n                        <td class=\"method-name ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(18, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "\"><a href=\"#"
    + escapeExpression(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"id","hash":{},"data":data}) : helper)))
    + "\" title=\""
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "\">"
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "</a></td>\n                        <td class=\"method-comment\" title=\""
    + escapeExpression(((helper = (helper = helpers.firstSentenceCommentText || (depth0 != null ? depth0.firstSentenceCommentText : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"firstSentenceCommentText","hash":{},"data":data}) : helper)))
    + "\">"
    + escapeExpression(((helper = (helper = helpers.firstSentenceCommentText || (depth0 != null ? depth0.firstSentenceCommentText : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"firstSentenceCommentText","hash":{},"data":data}) : helper)))
    + "</td>\n                    </tr>\n";
},"18":function(depth0,helpers,partials,data) {
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
  buffer += "</h2>\n        <div class=\"signatures\">\n";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.signatures : stack1), {"name":"each","hash":{},"fn":this.program(6, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "        </div>\n\n";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 != null ? depth0.methodNode : depth0)) != null ? stack1.html : stack1), {"name":"if","hash":{},"fn":this.program(14, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.contextMethods : depth0), {"name":"if","hash":{},"fn":this.program(16, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "    </div>\n</div>";
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