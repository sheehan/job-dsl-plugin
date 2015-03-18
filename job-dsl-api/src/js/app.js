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

            searchContext(data.context);
            return _.uniq(plugins);
        },

        initPluginSelect: function(data) {
            var html = Handlebars.templates['plugins']({plugins: this.getPluginList(data)});
            $('.plugins').html(html);
        },

        initTree: function(data) {
            var methods = _.filter(data.context.methods, this.nodeMatches, this);

            var treeNodes = methods.map(this.buildJstreeNode, this);
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
                }.bind(this))
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
            var data = {methodNode: methodNode};
            data.name = methodNode.name ? methodNode.name : 'Jenkins Job DSL API';
            if (methodNode.context) {
                data.contextMethods = _.filter(methodNode.context.methods, this.nodeMatches, this);
            }
            var html = Handlebars.templates['detail'](data);
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

                // find all children that are in this plugin
                // build nodes for those children

                var methods = _.filter(node.context.methods, this.nodeMatches, this);
                treeNode.children = methods.map(this.buildJstreeNode, this);
            }
            return treeNode;
        },

        nodeMatches: function(methodNode) {
            var matches = !this.pluginFilter || (methodNode.plugin && this.pluginFilter === methodNode.plugin.name);
            if (!matches) {
                matches = methodNode.context && methodNode.context.methods.some(this.nodeMatches, this);
            }
            return matches;
        }
    });

    $(function() {
        new App();
    });
}(jQuery));