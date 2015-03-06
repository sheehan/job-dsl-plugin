package javaposse.jobdsl.dsl.helpers.scm

import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.JobManagement
import javaposse.jobdsl.dsl.doc.DslMethodDoc

/**
 * DSL context for the
 * <a href="https://wiki.jenkins-ci.org/display/JENKINS/Team+Concert+Plugin">Team Concert Plugin</a>.
 */
class RTCContext implements Context {
    private final JobManagement jobManagement

    String buildType
    String buildDefinition
    String buildWorkspace
    String credentialsId
    boolean overrideGlobal
    int timeout
    String buildTool
    String serverURI

    RTCContext(JobManagement jobManagement) {
        this.jobManagement = jobManagement
    }

    @DslMethodDoc
    void buildDefinition(String buildDefinition) {
        this.buildDefinition = buildDefinition
        this.buildType = 'buildDefinition'
    }

    @DslMethodDoc
    void buildWorkspace(String buildWorkspace) {
        this.buildWorkspace = buildWorkspace
        this.buildType = 'buildWorkspace'
    }

    @DslMethodDoc
    void connection(String buildTool, String credentials, String serverURI, int timeout) {
        this.overrideGlobal = true
        this.buildTool = buildTool
        this.credentialsId = jobManagement.getCredentialsId(credentials)
        this.serverURI = serverURI
        this.timeout = timeout
    }
}
