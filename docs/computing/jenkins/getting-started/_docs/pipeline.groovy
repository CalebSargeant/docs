pipeline {
    agent any
    triggers { pollSCM('* * * * *') }
    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/CalebSargeant/jgsu-spring-petclinic'
            }
        }
        stage('Build') {
            steps {
                sh './mvnw clean package'
            }
            post {
                always {
                    junit '**/target/surefire-reports/TEST-*.xml'
                    archiveArtifacts 'target/*.jar'
                }
                changed {
                  emailext subject: 'Job \'${JOB_NAME}\' (${BUILD_NUMBER}) is waiting for input',
                    to: 'devops@calebsargeant.com',
                    body: 'Please go to ${BUILD_URL} and verify the build',
                    attachLog: true,
                    compressLog: true,
                    recipientProviders: [upstreamDevelopers(), requestor()]
                }
            }
        }
    }
}
