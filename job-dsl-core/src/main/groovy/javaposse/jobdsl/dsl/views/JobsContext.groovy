package javaposse.jobdsl.dsl.views

import javaposse.jobdsl.dsl.Context
import javaposse.jobdsl.dsl.doc.DslMethodDoc

import static com.google.common.base.Preconditions.checkNotNull

class JobsContext implements Context {
    Set<String> jobNames = []
    String regex

    @DslMethodDoc
    void name(String jobName) {
        checkNotNull(jobName, 'jobName must not be null')

        this.jobNames.add(jobName)
    }

    @DslMethodDoc
    void names(String... jobNames) {
        for (String jobName : jobNames) {
            name(jobName)
        }
    }

    @DslMethodDoc
    void regex(String regex) {
        this.regex = regex
    }
}
