package javaposse.jobdsl.dsl.doc;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface DslMethodDoc {
    public abstract String plugin() default "";
    public abstract String exampleXml() default "";
    public abstract String availableSinceVersion() default "";
    public abstract String deprecatedSinceVersion() default "";
}
