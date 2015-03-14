(function($) {

    var DslLoader = function() {
        this.dslsByUrl = {};
    };
    _.extend(DslLoader.prototype, {

        fetch: function(url) {
            var dsl = this.dslsByUrl[url];
            if (!dsl) {
                return $.get(url).then(function(data) {
                    data.context.methods.forEach(function(node) { this.processNode(node); }, this);
                    this.dslsByUrl[url] = data;
                    return data;
                }.bind(this));
            }
            return $.Deferred().resolveWith(null, [dsl]);
        },

        processNode: function(node, parent) {
            node.id = parent ? parent.id + '-' + node.name : node.name;
            if (parent) {
                node.ancestors = parent.ancestors.slice(0);
                node.ancestors.push({
                    id: parent.id,
                    name: parent.name
                });
            } else {
                node.ancestors = [];
            }
            if (node.plugin) {
                node.plugin = window.updateCenter.data.plugins[node.plugin];
            } else if (parent && parent.plugin) {
                node.plugin = parent.plugin;
            }

            if (node.signatures.every(function(sig) { return sig.deprecated || sig.deprecatedSince; })) {
                node.deprecated = true;
            }

            //if (parent && parent.deprecated) {
            //    node.deprecated = true;
            //}

            if (node.context) {
                node.context.methods.forEach(function(child) {
                    this.processNode(child, node);
                }, this);
            }
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

        $('.expand-all').click(function(e) {
            e.preventDefault();
            this.jstree.open_all();
        }.bind(this));

        $('.collapse-all').click(function(e) {
            e.preventDefault();
            this.jstree.close_all();
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
            this.dslLoader.fetch(url).then(this.initTree.bind(this));
        },

        initLayout: function() {
            this.layout = $('.layout-container').layout({
                west__paneSelector: '.tree',
                west__contentSelector: '.tree-body',
                west__size: 350,
                west__minSize: 350,
                west__spacing_open: 3,
                west__resizerCursor: 'ew-resize',
                center__paneSelector: '.detail-wrapper',
                north__size: 50,
                resizable: true,
                closable: false
            });
        },

        filterTree: function(pluginName) {
            this.jstree.open_all();

            var $allNodes = $('.tree-body li.jstree-node');
            if (!pluginName) {
                $allNodes.show();
                return;
            }

            // TODO select first leaf node
            $allNodes.hide();
            this.jstree.deselect_all(true);

            var data = this.jstree.get_json();
            var fcn = function(d) {
                var node = this.jstree.get_node(d).original;
                var $dom = $(this.jstree.get_node(d, true));
                if (node.methodNode.plugin && node.methodNode.plugin.name === pluginName) {
                    $dom.show();
                    $dom.find('li.jstree-node').show();
                    $dom.parentsUntil('.tree-body').filter('li.jstree-node').show();

                    if (!this.jstree.get_selected().length) {
                        this.jstree.select_node(this.jstree.get_node(d).id);
                    }
                } else {
                    d.children.forEach(fcn, this);
                }
            };

            data.forEach(fcn, this);
        },

        initTree: function(data) {
            this.data = data;

            var plugins = [];
            var searchContext = function(context) {
                context.methods.forEach(function(method) {
                    if (method.plugin) {
                        plugins.push(method.plugin);
                    }
                    if (method.context) {
                        searchContext(method.context);
                    }
                });
            };

            searchContext(data.context); // TODO move

            var html = Handlebars.templates['plugins']({plugins: _.uniq(plugins)});
            $('.plugins').html(html);

            var treeNodes = data.context.methods.map(this.buildJstreeNode, this);
            var $treeBody = $('.tree-body');

            $treeBody
                .jstree('destroy')
                .on('changed.jstree', this.onTreeChanged.bind(this))
                .on('ready.jstree', this.updateTreeFromHash.bind(this))
                .jstree({
                    'plugins': ['wholerow'],
                    'core': {
                        'data': treeNodes,
                        'themes': {
                            'name': 'proton',
                            'responsive': true
                        },
                        'multiple': false
                    }
                });
            this.jstree = $treeBody.jstree();
        },

        onTreeChanged: function(e, data) {
            e.preventDefault();
            var methodNode = data.node.original.methodNode;

            window.location.hash = methodNode.id;
            this.showMethodDetail(methodNode);

            this.layout.resizeAll();
        },

        updateTreeFromHash: function() {
            var hashId = window.location.hash;
            var node;
            if (hashId) {
                hashId = hashId.substring(1);

                var nodes = this.jstree.get_json(null, {flat: true});
                node = _.find(nodes, function(data) {
                    var methodNode = this.jstree.get_node(data.id).original.methodNode;
                    return methodNode.id === hashId;
                }, this);
            }

            if (node) {
                this.jstree.deselect_all(true);
                this.jstree.select_node(node.id);
            } else {
                this.jstree.deselect_all(true);
                this.showMethodDetail(this.data);
            }
        },

        showMethodDetail: function(methodNode) {
            var html = Handlebars.templates['detail'](methodNode);
            $('.detail-wrapper').html(html);

            $('.signatures pre').each(function(i, block) {
                hljs.highlightBlock(block);
            });

            $('.method-doc pre code').each(function(i, block) {
                hljs.highlightBlock(block);
            });

            $('.example-xml').each(function(i, block) {
                hljs.highlightBlock(block);
            });
        },

        buildJstreeNode: function(node) {
            var treeNode = {
                text: node.name,
                icon: false,
                methodNode: node
            };
            if (node.deprecated) {
                treeNode.a_attr = {'class': 'deprecated'};
            }
            if (node.context) {
                treeNode.state = {
                    opened: false
                };
                treeNode.children = node.context.methods.map(this.buildJstreeNode, this);
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
    + escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)))
    + "</a></li>\n";
},"4":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"name","hash":{},"data":data}) : helper)));
  },"6":function(depth0,helpers,partials,data) {
  return "Jenkins Job DSL API";
  },"8":function(depth0,helpers,partials,data) {
  var stack1, lambda=this.lambda, escapeExpression=this.escapeExpression;
  return "<a href=\""
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.wiki : stack1), depth0))
    + "\"><span class=\"glyphicon glyphicon-new-window\"></span> "
    + escapeExpression(lambda(((stack1 = (depth0 != null ? depth0.plugin : depth0)) != null ? stack1.title : stack1), depth0))
    + "</a>";
},"10":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.availableSince : depth0), {"name":"if","hash":{},"fn":this.program(11, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecatedSince : depth0), {"name":"if","hash":{},"fn":this.program(13, data),"inverse":this.program(15, data),"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "                <pre>"
    + escapeExpression(((helper = (helper = helpers.text || (depth0 != null ? depth0.text : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"text","hash":{},"data":data}) : helper)))
    + "</pre>\n";
},"11":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                    <span class=\"label label-info\">Available since "
    + escapeExpression(((helper = (helper = helpers.availableSince || (depth0 != null ? depth0.availableSince : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"availableSince","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"13":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "                    <span class=\"label label-warning\">Deprecated since "
    + escapeExpression(((helper = (helper = helpers.deprecatedSince || (depth0 != null ? depth0.deprecatedSince : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"deprecatedSince","hash":{},"data":data}) : helper)))
    + "</span>\n";
},"15":function(depth0,helpers,partials,data) {
  var stack1, buffer = "";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(16, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer;
},"16":function(depth0,helpers,partials,data) {
  return "                        <span class=\"label label-warning\">Deprecated</span>\n";
  },"18":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, buffer = "            <!--<h3>Description</h3>-->\n            <div class=\"method-doc\">";
  stack1 = ((helper = (helper = helpers.html || (depth0 != null ? depth0.html : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"html","hash":{},"data":data}) : helper));
  if (stack1 != null) { buffer += stack1; }
  return buffer + "</div>\n";
},"20":function(depth0,helpers,partials,data) {
  var stack1, buffer = "            <h3>Context Methods</h3>\n            <table class=\"table table-condensed methods\">\n";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 != null ? depth0.context : depth0)) != null ? stack1.methods : stack1), {"name":"each","hash":{},"fn":this.program(21, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "            </table>\n";
},"21":function(depth0,helpers,partials,data) {
  var stack1, helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, buffer = "                    <tr>\n                        <td class=\"method-name ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.deprecated : depth0), {"name":"if","hash":{},"fn":this.program(22, data),"inverse":this.noop,"data":data});
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
},"22":function(depth0,helpers,partials,data) {
  return "deprecated";
  },"24":function(depth0,helpers,partials,data) {
  var helper, functionType="function", helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;
  return "-->\n        <!--<h3>Example XML</h3>-->\n        <!--<div class=\"\">-->\n        <!--<pre class=\"example-xml\">"
    + escapeExpression(((helper = (helper = helpers.exampleXml || (depth0 != null ? depth0.exampleXml : depth0)) != null ? helper : helperMissing),(typeof helper === functionType ? helper.call(depth0, {"name":"exampleXml","hash":{},"data":data}) : helper)))
    + "</pre>-->\n        <!--</div>-->\n        <!--";
},"compiler":[6,">= 2.0.0-beta.1"],"main":function(depth0,helpers,partials,data) {
  var stack1, buffer = "<div class=\"detail\">\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.ancestors : depth0), {"name":"if","hash":{},"fn":this.program(1, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "    <div class=\"method-detail\">\n        <h2>\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.name : depth0), {"name":"if","hash":{},"fn":this.program(4, data),"inverse":this.program(6, data),"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.plugin : depth0), {"name":"if","hash":{},"fn":this.program(8, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "</h2>\n        <div class=\"signatures\">\n";
  stack1 = helpers.each.call(depth0, (depth0 != null ? depth0.signatures : depth0), {"name":"each","hash":{},"fn":this.program(10, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "        </div>\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.html : depth0), {"name":"if","hash":{},"fn":this.program(18, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.context : depth0), {"name":"if","hash":{},"fn":this.program(20, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  buffer += "\n        <!--";
  stack1 = helpers['if'].call(depth0, (depth0 != null ? depth0.exampleXml : depth0), {"name":"if","hash":{},"fn":this.program(24, data),"inverse":this.noop,"data":data});
  if (stack1 != null) { buffer += stack1; }
  return buffer + "-->\n\n    </div>\n</div>";
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