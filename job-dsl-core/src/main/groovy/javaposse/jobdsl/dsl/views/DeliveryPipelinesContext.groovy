package javaposse.jobdsl.dsl.views

import javaposse.jobdsl.dsl.Context

import static com.google.common.base.Preconditions.checkArgument
import static com.google.common.base.Strings.isNullOrEmpty

class DeliveryPipelinesContext implements Context {
    Map<String, String> components = [:]
    List<String> regularExpressions = []

    /**
     * Add a pipeline by specifying name and start job.
     */
    void component(String name, String initialJobName) {
        checkArgument(!isNullOrEmpty(name), 'name must be specified')
        checkArgument(!isNullOrEmpty(initialJobName), 'initialJobName must be specified')

        components[name] = initialJobName
    }

    /**
     * Add a pipeline by specifying a regular expression.
     */
    void regex(String regex) {
        checkArgument(!isNullOrEmpty(regex), 'regex must be specified')

        regularExpressions << regex
    }
}
