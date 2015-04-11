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
                data.contextMethods = this.data.contexts[methodNode.contextClass].methods.map(function(method) {
                    return {
                        id: node? node.id.substr(5) + '-' + method.name : method.name,
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