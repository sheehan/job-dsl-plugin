package javaposse.jobdsl.dsl

import com.google.common.base.Preconditions
import javaposse.jobdsl.dsl.doc.DslMethodDoc
import javaposse.jobdsl.dsl.helpers.AuthorizationContext
import javaposse.jobdsl.dsl.helpers.BuildParametersContext
import javaposse.jobdsl.dsl.helpers.Permissions
import javaposse.jobdsl.dsl.helpers.ScmContext
import javaposse.jobdsl.dsl.helpers.publisher.PublisherContext
import javaposse.jobdsl.dsl.helpers.step.StepContext
import javaposse.jobdsl.dsl.helpers.toplevel.EnvironmentVariableContext
import javaposse.jobdsl.dsl.helpers.toplevel.LockableResourcesContext
import javaposse.jobdsl.dsl.helpers.toplevel.NotificationContext
import javaposse.jobdsl.dsl.helpers.toplevel.ThrottleConcurrentBuildsContext
import javaposse.jobdsl.dsl.helpers.triggers.TriggerContext
import javaposse.jobdsl.dsl.helpers.wrapper.WrapperContext

/**
 * DSL element representing a Jenkins job.
 */
abstract class Job extends Item {
    String templateName = null // Optional
    String previousNamesRegex = null // Optional

    protected Job(JobManagement jobManagement) {
        super(jobManagement)
    }

    /**
     * Creates a new job configuration, based on the job template referenced by the parameter and stores this.
     * @param templateName the name of the template upon which to base the new job
     * @return a new graph of groovy.util.Node objects, representing the job configuration structure
     * @throws JobTemplateMissingException
     */
    @DslMethodDoc
    void using(String templateName) throws JobTemplateMissingException {
        Preconditions.checkState(this.templateName == null, 'Can only use "using" once')
        this.templateName = templateName
    }

    @Deprecated
    @DslMethodDoc(deprecatedSince = '1.30')
    void name(Closure nameClosure) {
        jobManagement.logDeprecationWarning()
        name(nameClosure.call().toString())
    }

    @DslMethodDoc
    void description(String descriptionString) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('description', descriptionString)
            project / node
        }
    }

    /**
     * Renames jobs matching the regular expression (fullName) to the name of
     * this job before the configuration is updated.
     * This can be useful to keep the build history.
     */
    @DslMethodDoc
    void previousNames(String regex) {
        this.previousNamesRegex = regex
    }

    /**
     * "Restrict where this project can be run"
     * <assignedNode>FullTools&amp;&amp;RPM&amp;&amp;DC</assignedNode>
     * @param labelExpression Label of node to use, if null is passed in, the label is cleared out and it can roam
     * @return
     */
    @DslMethodDoc
    void label(String labelExpression = null) {
        withXmlActions << WithXmlAction.create { Node project ->
            if (labelExpression) {
                project / assignedNode(labelExpression)
                project / canRoam(false) // If canRoam is true, the label will not be used
            } else {
                project / assignedNode('')
                project / canRoam(true)
            }
        }
    }

    /**
     * Add environment variables to the build.
     *
     * <project>
     *   <properties>
     *     <EnvInjectJobProperty>
     *       <info>
     *         <propertiesContent>TEST=foo BAR=123</propertiesContent>
     *         <loadFilesFromMaster>false</loadFilesFromMaster>
     *       </info>
     *       <on>true</on>
     *       <keepJenkinsSystemVariables>true</keepJenkinsSystemVariables>
     *       <keepBuildVariables>true</keepBuildVariables>
     *       <contributors/>
     *     </EnvInjectJobProperty>
     */
    @DslMethodDoc
    void environmentVariables(@DslContext(EnvironmentVariableContext) Closure envClosure) {
        environmentVariables(null, envClosure)
    }

    @DslMethodDoc
    void environmentVariables(Map<Object, Object> vars,
                              @DslContext(EnvironmentVariableContext) Closure envClosure = null) {
        EnvironmentVariableContext envContext = new EnvironmentVariableContext(jobManagement)
        if (vars) {
            envContext.envs(vars)
        }
        ContextHelper.executeInContext(envClosure, envContext)

        withXmlActions << WithXmlAction.create { Node project ->
            project / 'properties' / 'EnvInjectJobProperty' {
                envContext.addInfoToBuilder(delegate)
                on(true)
                keepJenkinsSystemVariables(envContext.keepSystemVariables)
                keepBuildVariables(envContext.keepBuildVariables)
                overrideBuildParameters(envContext.overrideBuildParameters)
                contributors().children().addAll(envContext.contributorsContext.contributors)
            }
        }
    }

    /**
     * <project>
     *     <properties>
     *         <hudson.plugins.throttleconcurrents.ThrottleJobProperty>
     *             <maxConcurrentPerNode>0</maxConcurrentPerNode>
     *             <maxConcurrentTotal>0</maxConcurrentTotal>
     *             <categories>
     *                 <string>CDH5-repo-update</string>
     *             </categories>
     *             <throttleEnabled>true</throttleEnabled>
     *             <throttleOption>category</throttleOption>
     *         </hudson.plugins.throttleconcurrents.ThrottleJobProperty>
     *     <properties>
     * </project>
     */
    @DslMethodDoc
    void throttleConcurrentBuilds(@DslContext(ThrottleConcurrentBuildsContext) Closure throttleClosure) {
        ThrottleConcurrentBuildsContext throttleContext = new ThrottleConcurrentBuildsContext()
        ContextHelper.executeInContext(throttleClosure, throttleContext)

        withXmlActions << WithXmlAction.create { Node project ->
            project / 'properties' / 'hudson.plugins.throttleconcurrents.ThrottleJobProperty' {
                maxConcurrentPerNode throttleContext.maxConcurrentPerNode
                maxConcurrentTotal throttleContext.maxConcurrentTotal
                throttleEnabled throttleContext.throttleDisabled ? 'false' : 'true'
                if (throttleContext.categories.isEmpty()) {
                    throttleOption 'project'
                } else {
                    throttleOption 'category'
                }
                categories {
                    throttleContext.categories.each { c ->
                        string c
                    }
                }
            }
        }
    }

    /**
     * <project>
     *     <properties>
     *         <org.jenkins.plugins.lockableresources.RequiredResourcesProperty>
     *             <resourceNames>lock-resource</resourceNames>
     *             <resourceNamesVar>NAMES</resourceNamesVar>
     *             <resourceNumber>0</resourceNumber>
     *         </org.jenkins.plugins.lockableresources.RequiredResourcesProperty>
     *     <properties>
     * </project>
     */
    void lockableResources(String resources, @DslContext(LockableResourcesContext) Closure lockClosure = null) {
        LockableResourcesContext lockContext = new LockableResourcesContext()
        ContextHelper.executeInContext(lockClosure, lockContext)

        withXmlActions << WithXmlAction.create { Node project ->
            project / 'properties' / 'org.jenkins.plugins.lockableresources.RequiredResourcesProperty' {
                resourceNames resources
                if (lockContext.resourcesVariable) {
                    resourceNamesVar lockContext.resourcesVariable
                }
                if (lockContext.resourceNumber != null) {
                    resourceNumber lockContext.resourceNumber
                }
            }
        }
    }

    /**
     * <disabled>true</disabled>
     */
    @DslMethodDoc
    void disabled(boolean shouldDisable = true) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('disabled', shouldDisable)
            project / node
        }
    }

    /**
     * <logRotator>
     *     <daysToKeep>14</daysToKeep>
     *     <numToKeep>50</numToKeep>
     *     <artifactDaysToKeep>5</artifactDaysToKeep>
     *     <artifactNumToKeep>20</artifactNumToKeep>
     * </logRotator>
     */
    @DslMethodDoc
    void logRotator(int daysToKeepInt = -1, int numToKeepInt = -1,
                   int artifactDaysToKeepInt = -1, int artifactNumToKeepInt = -1) {
        withXmlActions << WithXmlAction.create { Node project ->
            project / logRotator {
                daysToKeep daysToKeepInt
                numToKeep numToKeepInt
                artifactDaysToKeep artifactDaysToKeepInt
                artifactNumToKeep artifactNumToKeepInt
            }
        }
    }

    /**
     * Block build if certain jobs are running
     * <properties>
     *     <hudson.plugins.buildblocker.BuildBlockerProperty>
     *         <useBuildBlocker>true</useBuildBlocker>  <!-- Always true -->
     *         <blockingJobs>JobA</blockingJobs>
     *     </hudson.plugins.buildblocker.BuildBlockerProperty>
     * </properties>
     */
    @DslMethodDoc
    void blockOn(Iterable<String> projectNames) {
        blockOn(projectNames.join('\n'))
    }

    /**
     * Block build if certain jobs are running.
     * @param projectName Can be regular expressions. Newline delimited.
     * @return
     */
    @DslMethodDoc
    void blockOn(String projectName) {
        withXmlActions << WithXmlAction.create { Node project ->
            project / 'properties' / 'hudson.plugins.buildblocker.BuildBlockerProperty' {
                useBuildBlocker 'true'
                blockingJobs projectName
            }
        }
    }

    /**
     * Name of the JDK installation to use for this job.
     * @param jdkArg name of the JDK installation to use for this job.
     */
    @DslMethodDoc
    void jdk(String jdkArg) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('jdk', jdkArg)
            project / node
        }
    }

    /**
     * Priority of this job. Requires the
     * <a href="https://wiki.jenkins-ci.org/display/JENKINS/Priority+Sorter+Plugin">Priority Sorter Plugin</a>.
     * Default value is 100.
     *
     * <properties>
     *     <hudson.queueSorter.PrioritySorterJobProperty plugin="PrioritySorter@1.3">
     *         <priority>100</priority>
     *     </hudson.queueSorter.PrioritySorterJobProperty>
     * </properties>
     */
    @DslMethodDoc
    void priority(int value) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = new Node(project / 'properties', 'hudson.queueSorter.PrioritySorterJobProperty')
            node.appendNode('priority', value)
        }
    }

    /**
     * Adds a quiet period to the project.
     *
     * @param seconds number of seconds to wait
     */
    @DslMethodDoc
    void quietPeriod(int seconds = 5) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('quietPeriod', seconds)
            project / node
        }
    }

    /**
     * Sets the number of times the SCM checkout is retried on errors.
     *
     * @param times number of attempts
     */
    @DslMethodDoc
    void checkoutRetryCount(int times = 3) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('scmCheckoutRetryCount', times)
            project / node
        }
    }

    /**
     * Sets a display name for the project.
     *
     * @param displayName name to display
     */
    @DslMethodDoc
    void displayName(String displayName) {
        Preconditions.checkNotNull(displayName, 'Display name must not be null.')
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('displayName', displayName)
            project / node
        }
    }

    /**
     * Configures a custom workspace for the project.
     *
     * @param workspacePath workspace path to use
     */
    @DslMethodDoc
    void customWorkspace(String workspacePath) {
        Preconditions.checkNotNull(workspacePath, 'Workspace path must not be null')
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('customWorkspace', workspacePath)
            project / node
        }
    }

    /**
     * Configures the job to block when upstream projects are building.
     */
    @DslMethodDoc
    void blockOnUpstreamProjects() {
        withXmlActions << WithXmlAction.create { Node project ->
            project / blockBuildWhenUpstreamBuilding(true)
        }
    }

    /**
     * Configures the job to block when downstream projects are building.
     */
    @DslMethodDoc
    void blockOnDownstreamProjects() {
        withXmlActions << WithXmlAction.create { Node project ->
            project / blockBuildWhenDownstreamBuilding(true)
        }
    }

    /**
     * Configures the keep Dependencies Flag which can be set in the Fingerprinting action
     *
     * <keepDependencies>true</keepDependencies>
     */
    @DslMethodDoc
    void keepDependencies(boolean keep = true) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('keepDependencies', keep)
            project / node
        }
    }

    /**
     * Configures the 'Execute concurrent builds if necessary' flag
     *
     * <concurrentBuild>true</concurrentBuild>
     */
    @DslMethodDoc
    void concurrentBuild(boolean allowConcurrentBuild = true) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node node = methodMissing('concurrentBuild', allowConcurrentBuild)
            project / node
        }
    }

    /**
     * Configures the Notification Plugin.
     *
     * <properties>
     *     <com.tikal.hudson.plugins.notification.HudsonNotificationProperty>
     *         <endpoints>
     *             <com.tikal.hudson.plugins.notification.Endpoint>
     *                 <protocol>HTTP</protocol>
     *                 <format>JSON</format>
     *                 <url />
     *                 <event>all</event>
     *                 <timeout>30000</timeout>
     *             </com.tikal.hudson.plugins.notification.Endpoint>
     *         </endpoints>
     *     </com.tikal.hudson.plugins.notification.HudsonNotificationProperty>
     * </properties>
     */
    @DslMethodDoc
    void notifications(@DslContext(NotificationContext) Closure notificationClosure) {
        NotificationContext notificationContext = new NotificationContext(jobManagement)
        ContextHelper.executeInContext(notificationClosure, notificationContext)

        withXmlActions << WithXmlAction.create { Node project ->
            project / 'properties' / 'com.tikal.hudson.plugins.notification.HudsonNotificationProperty' {
                endpoints notificationContext.endpoints
            }
        }
    }

    /**
     * Adds batch tasks that are not regularly executed to projects, such as releases, integration, archiving. Can be called
     * multiple times to add more batch tasks.
     */
    @DslMethodDoc(
        plugin = 'batch-task',
        availableSince = '1.24',
        exampleXml = '''
            <properties>
                <hudson.plugins.batch__task.BatchTaskProperty>
                    <tasks>
                        <hudson.plugins.batch__task.BatchTask>
                            <name>Hello World</name>
                            <script>echo Hello World</script>
                        </hudson.plugins.batch__task.BatchTask>
                    </tasks>
                </hudson.plugins.batch__task.BatchTaskProperty>
            </properties>
        '''
    )
    void batchTask(String name, String script) {
        withXmlActions << WithXmlAction.create { Node project ->
            Node batchTaskProperty = project / 'properties' / 'hudson.plugins.batch__task.BatchTaskProperty'
            batchTaskProperty / 'tasks' << 'hudson.plugins.batch__task.BatchTask' {
                delegate.name name
                delegate.script script
            }
        }
    }

    /**
     * <properties>
     *     <se.diabol.jenkins.pipeline.PipelineProperty>
     *         <taskName>integration-tests</taskName>
     *         <stageName>qa</stageName>
     *     </se.diabol.jenkins.pipeline.PipelineProperty>
     * </properties>
     */
    @DslMethodDoc
    void deliveryPipelineConfiguration(String stageName, String taskName = null) {
        if (stageName || taskName) {
            withXmlActions << WithXmlAction.create { Node project ->
                project / 'properties' / 'se.diabol.jenkins.pipeline.PipelineProperty' {
                    if (taskName) {
                        delegate.taskName(taskName)
                    }
                    if (stageName) {
                        delegate.stageName(stageName)
                    }
                }
            }
        }
    }

    @DslMethodDoc
    void authorization(@DslContext(AuthorizationContext) Closure closure) {
        AuthorizationContext context = new AuthorizationContext()
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            Node authorizationMatrixProperty = project / 'properties' / 'hudson.security.AuthorizationMatrixProperty'
            context.permissions.each { String perm ->
                authorizationMatrixProperty.appendNode('permission', perm)
            }
        }
    }

    @Deprecated
    @DslMethodDoc
    void permission(String permission) {
        jobManagement.logDeprecationWarning()

        authorization {
            delegate.permission(permission)
        }
    }

    @Deprecated
    @DslMethodDoc
    void permission(Permissions permission, String user) {
        jobManagement.logDeprecationWarning()

        authorization {
            delegate.permission(permission, user)
        }
    }

    @Deprecated
    @DslMethodDoc
    void permission(String permissionEnumName, String user) {
        jobManagement.logDeprecationWarning()

        authorization {
            delegate.permission(permissionEnumName, user)
        }
    }

    @DslMethodDoc
    void parameters(@DslContext(BuildParametersContext) Closure closure) {
        BuildParametersContext context = new BuildParametersContext()
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            Node node = project / 'properties' / 'hudson.model.ParametersDefinitionProperty' / 'parameterDefinitions'
            context.buildParameterNodes.values().each {
                node << it
            }
        }
    }

    @DslMethodDoc
    void scm(@DslContext(ScmContext) Closure closure) {
        ScmContext context = new ScmContext(false, withXmlActions, jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            Node scm = project / scm
            if (scm) {
                // There can only be only one SCM, so remove if there
                project.remove(scm)
            }

            // Assuming append the only child
            project << context.scmNode
        }
    }

    @DslMethodDoc
    void multiscm(@DslContext(ScmContext) Closure closure) {
        ScmContext context = new ScmContext(true, withXmlActions, jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            Node scm = project / scm
            if (scm) {
                // There can only be only one SCM, so remove if there
                project.remove(scm)
            }

            Node multiscmNode = new NodeBuilder().scm(class: 'org.jenkinsci.plugins.multiplescms.MultiSCM')
            Node scmsNode = multiscmNode / scms
            context.scmNodes.each {
                scmsNode << it
            }

            // Assuming append the only child
            project << multiscmNode
        }
    }

    void triggers(@DslContext(TriggerContext) Closure closure) {
        TriggerContext context = new TriggerContext(jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            context.triggerNodes.each {
                project / 'triggers' << it
            }
        }
    }

    void wrappers(@DslContext(WrapperContext) Closure closure) {
        WrapperContext context = new WrapperContext(jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            context.wrapperNodes.each {
                project / 'buildWrappers' << it
            }
        }
    }

    @DslMethodDoc
    void steps(@DslContext(StepContext) Closure closure) {
        StepContext context = new StepContext(jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            context.stepNodes.each {
                project / 'builders' << it
            }
        }
    }

    void publishers(@DslContext(PublisherContext) Closure closure) {
        PublisherContext context = new PublisherContext(jobManagement)
        ContextHelper.executeInContext(closure, context)

        withXmlActions << WithXmlAction.create { Node project ->
            context.publisherNodes.each {
                project / 'publishers' << it
            }
        }
    }

    void providedSettings(String settingsName) {
        String settingsId = jobManagement.getConfigFileId(ConfigFileType.MavenSettings, settingsName)
        Preconditions.checkNotNull(settingsId, "Managed Maven settings with name '${settingsName}' not found")

        withXmlActions << WithXmlAction.create { Node project ->
            project / settings(class: 'org.jenkinsci.plugins.configfiles.maven.job.MvnSettingsProvider') {
                settingsConfigId(settingsId)
            }
        }
    }

    Node getNode() {
        Node project = templateName == null ? executeEmptyTemplate() : executeUsing()

        executeWithXmlActions(project)

        project
    }

    void executeWithXmlActions(final Node root) {
        // Create builder, based on what we already have
        withXmlActions.each { WithXmlAction withXmlClosure ->
            withXmlClosure.execute(root)
        }
    }

    private Node executeUsing() {
        String configXml
        try {
            configXml = jobManagement.getConfig(templateName)
            if (configXml == null) {
                throw new JobConfigurationNotFoundException()
            }
        } catch (JobConfigurationNotFoundException jcnfex) {
            throw new JobTemplateMissingException(templateName)
        }

        Node templateNode = new XmlParser().parse(new StringReader(configXml))
        Node emptyTemplateNode = executeEmptyTemplate()

        if (emptyTemplateNode.name() != templateNode.name()) {
            throw new JobTypeMismatchException(name, templateName)
        }

        templateNode
    }

    private Node executeEmptyTemplate() {
        new XmlParser().parse(this.class.getResourceAsStream("${this.class.simpleName}-template.xml"))
    }
}
