package javaposse.jobdsl.dsl.helpers.scm

import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.doc.DslMethodDoc

/**
 * DSL for the Clear Case plugin
 *
 * See http://wiki.jenkins-ci.org/display/JENKINS/ClearCase+Plugin
 */
class ClearCaseContext implements Context {
    List<String> loadRules = []
    List<String> mkviewOptionalParameter = []
    String viewName = 'Jenkins_${USER_NAME}_${NODE_NAME}_${JOB_NAME}${DASH_WORKSPACE_NUMBER}'
    String viewPath = 'view'
    List<String> configSpec = []

    @DslMethodDoc
    void configSpec(String... configSpec) {
        this.configSpec.addAll(configSpec)
    }

    @DslMethodDoc
    void loadRules(String... loadRules) {
        this.loadRules.addAll(loadRules)
    }

    @DslMethodDoc
    void mkviewOptionalParameter(String... mkviewOptionalParameter) {
        this.mkviewOptionalParameter.addAll(mkviewOptionalParameter)
    }

    @DslMethodDoc
    void viewName(String viewName) {
        this.viewName = viewName
    }

    @DslMethodDoc
    void viewPath(String viewPath) {
        this.viewPath = viewPath
    }
}
