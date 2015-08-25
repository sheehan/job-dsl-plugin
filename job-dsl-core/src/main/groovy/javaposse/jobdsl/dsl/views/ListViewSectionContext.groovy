package javaposse.jobdsl.dsl.views

import javaposse.jobdsl.dsl.AbstractContext
import javaposse.jobdsl.dsl.DslContext
import javaposse.jobdsl.dsl.JobManagement

import static com.google.common.base.Preconditions.checkArgument
import static javaposse.jobdsl.dsl.ContextHelper.executeInContext

class ListViewSectionContext extends AbstractContext {
    private static final List<String> VALID_WIDTHS = ['FULL', 'HALF', 'THIRD', 'TWO_THIRDS']
    private static final List<String> VALID_ALIGNMENTS = ['CENTER', 'LEFT', 'RIGHT']

    String name
    String width = 'FULL'
    String alignment = 'CENTER'
    JobsContext jobsContext = new JobsContext()
    JobFiltersContext jobFiltersContext = new JobFiltersContext()
    ColumnsContext columnsContext = new ColumnsContext(jobManagement)

    ListViewSectionContext(JobManagement jobManagement) {
        super(jobManagement)
    }

    /**
     * Sets the name of the section.
     */
    void name(String name) {
        this.name = name
    }

    /**
     * Sets the with of the section. Either {@code 'FULL'}, {@code 'HALF'}, {@code 'THIRD'} or {@code 'TWO_THIRDS'}.
     */
    void width(String width) {
        checkArgument(VALID_WIDTHS.contains(width), "width must be one of ${VALID_WIDTHS.join(', ')}")
        this.width = width
    }

    /**
     * Sets the alignment of the section. Either {@code 'CENTER'}, {@code 'LEFT'} or {@code 'RIGHT'}.
     */
    void alignment(String alignment) {
        checkArgument(VALID_ALIGNMENTS.contains(alignment), "alignment must be one of ${VALID_ALIGNMENTS.join(', ')}")
        this.alignment = alignment
    }

    /**
     * Adds jobs to the section.
     */
    void jobs(@DslContext(JobsContext) Closure jobsClosure) {
        executeInContext(jobsClosure, jobsContext)
    }

    /**
     * Adds or removes jobs from the view by specifying filters.
     *
     * @since 1.29
     */
    void jobFilters(@DslContext(JobFiltersContext) Closure jobFiltersClosure) {
        executeInContext(jobFiltersClosure, jobFiltersContext)
    }

    /**
     * Adds columns to the views. The view will have no columns by default.
     */
    void columns(@DslContext(ColumnsContext) Closure columnsClosure) {
        executeInContext(columnsClosure, columnsContext)
    }
}
