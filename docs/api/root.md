The DSL execution engine exposes a method, called `job`. This `job` method implies the creation of a Jenkins job
and the closure to this method can be used to define the job's settings. The only mandatory option is `name`.

```groovy
job {
    name 'my-job'
}
```

There are similar methods to create Jenkins views, folders and config files:

```groovy
view {
    name 'my-view'
}

folder {
    name 'my-folder'
}

configFile {
    name 'my-config'
}
```

When defining jobs, views or folders the name is treated as absolute to the Jenkins root by default, but the seed job
can be configured to interpret names relative to the seed job. (since 1.24)

In the closure provided to `job` there are a few top level methods, like `label` and `chucknorris`. Others are nested
deeper in blocks which represent their role in Jenkins, e.g. the `publishers` block contains all the publisher actions.

DSL methods can be cumulative or overriding, meaning that some methods will add nodes (e.g. `publishers` and `steps`)
and some will replace nodes (e.g. `disabled` will replace any existing disabled nodes). Some methods like `scm` and
`multiscm` are mutually exclusive. Likewise, when using the `scm` block, only one SCM can be specified.

When a DSL method isn't available, look at [The Configure Block](https://github.com/jenkinsci/job-dsl-plugin/wiki/The-Configure-Block) for extending the DSL.

**NOTE: when using these methods, remember that you need to use them in context. I.e. to use the `downstream` method,
it needs to be enclosed in a `publishers` context.**