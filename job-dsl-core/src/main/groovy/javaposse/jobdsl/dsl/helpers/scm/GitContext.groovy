package javaposse.jobdsl.dsl.helpers.scm

import hudson.util.VersionNumber
import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.DslContext
import javaposse.jobdsl.dsl.JobManagement
import javaposse.jobdsl.dsl.WithXmlAction
import javaposse.jobdsl.dsl.doc.DslMethodDoc

import static javaposse.jobdsl.dsl.ContextHelper.executeInContext

class GitContext implements Context {
    private final List<WithXmlAction> withXmlActions
    private final JobManagement jobManagement

    List<Node> remoteConfigs = []
    List<String> branches = []
    boolean createTag = false
    boolean clean = false
    boolean wipeOutWorkspace = false
    boolean remotePoll = false
    boolean shallowClone = false
    boolean pruneBranches = false
    String localBranch
    String relativeTargetDir
    String reference = ''
    Closure withXmlClosure
    final GitBrowserContext gitBrowserContext = new GitBrowserContext()
    Node mergeOptions
    Integer cloneTimeout
    List<Node> extensions = []
    final StrategyContext strategyContext = new StrategyContext(jobManagement)

    GitContext(List<WithXmlAction> withXmlActions, JobManagement jobManagement) {
        this.jobManagement = jobManagement
        this.withXmlActions = withXmlActions
    }

    @DslMethodDoc
    void remote(@DslContext(RemoteContext) Closure remoteClosure) {
        RemoteContext remoteContext = new RemoteContext(withXmlActions)
        executeInContext(remoteClosure, remoteContext)

        remoteConfigs << NodeBuilder.newInstance().'hudson.plugins.git.UserRemoteConfig' {
            if (remoteContext.name) {
                name(remoteContext.name)
            }
            if (remoteContext.refspec) {
                refspec(remoteContext.refspec)
            }
            url(remoteContext.url)
            if (remoteContext.credentials) {
                credentialsId(jobManagement.getCredentialsId(remoteContext.credentials))
            }
        }

        if (remoteContext.browser) {
            gitBrowserContext.browser = remoteContext.browser
        }
    }

    @DslMethodDoc
    void strategy(@DslContext(StrategyContext) Closure strategyClosure) {
        executeInContext(strategyClosure, strategyContext)
    }

    @DslMethodDoc
    void mergeOptions(String remote = null, String branch) {
        if (jobManagement.getPluginVersion('git')?.isOlderThan(new VersionNumber('2.0.0'))) {
            mergeOptions = NodeBuilder.newInstance().'userMergeOptions' {
                mergeRemote(remote ?: '')
                mergeTarget(branch)
            }
        } else {
            extensions << NodeBuilder.newInstance().'hudson.plugins.git.extensions.impl.PreBuildMerge' {
                options {
                    mergeRemote(remote ?: '')
                    mergeTarget(branch)
                    mergeStrategy('default')
                }
            }
        }
    }

    @DslMethodDoc
    void branch(String branch) {
        this.branches.add(branch)
    }

    @DslMethodDoc
    void branches(String... branches) {
        this.branches.addAll(branches)
    }

    @DslMethodDoc
    void createTag(boolean createTag = true) {
        this.createTag = createTag
    }

    @DslMethodDoc
    void clean(boolean clean = true) {
        this.clean = clean
    }

    @DslMethodDoc
    void wipeOutWorkspace(boolean wipeOutWorkspace = true) {
        this.wipeOutWorkspace = wipeOutWorkspace
    }

    @DslMethodDoc
    void remotePoll(boolean remotePoll = true) {
        this.remotePoll = remotePoll
    }

    @DslMethodDoc
    void shallowClone(boolean shallowClone = true) {
        this.shallowClone = shallowClone
    }

    @DslMethodDoc
    void pruneBranches(boolean pruneBranches = true) {
        this.pruneBranches = pruneBranches
    }

    @DslMethodDoc
    void localBranch(String localBranch) {
        this.localBranch = localBranch
    }

    @DslMethodDoc
    void relativeTargetDir(String relativeTargetDir) {
        this.relativeTargetDir = relativeTargetDir
    }

    @DslMethodDoc
    void reference(String reference) {
        this.reference = reference
    }

    @DslMethodDoc
    void cloneTimeout(int cloneTimeout) {
        jobManagement.requireMinimumPluginVersion('git', '2.0.0')
        this.cloneTimeout = cloneTimeout
    }

    @DslMethodDoc
    void browser(@DslContext(GitBrowserContext) Closure gitBrowserClosure) {
        executeInContext(gitBrowserClosure, gitBrowserContext)
    }

    @DslMethodDoc
    void configure(Closure withXmlClosure) {
        this.withXmlClosure = withXmlClosure
    }
}
